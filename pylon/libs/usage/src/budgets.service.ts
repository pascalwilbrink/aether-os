import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { fromMicros, toMicros } from '@pylon/catalog';
import {
  AccessControl,
  PylonEvents,
  Transactional,
  type ApiTypes,
} from '@pylon/core';
import { TenancyService } from '@pylon/tenancy';

import {
  reached,
  THRESHOLD_PERCENT,
  windowOf,
  type BudgetWindow,
} from './budget-window.js';
import { BudgetEntity, type BudgetScope } from './budget.entity.js';
import { BudgetMapper } from './budget.mapper.js';
import type { BudgetContext } from './call-context.js';
import { ModelCallsService, type SpendScope } from './model-calls.service.js';

/** A budget that ran out: which, for `402 BUDGET_EXHAUSTED` and pausing. */
export interface ExhaustedBudget {
  scope: BudgetScope;
  scopeId: string;
}

/** Checked narrowest first: the budget that ran out is the one named. */
const SCOPES: BudgetScope[] = ['task_tree', 'agent', 'project', 'organization'];

const scopeIdOf = (context: BudgetContext, scope: BudgetScope) =>
  ({
    organization: context.organizationId,
    project: context.projectId,
    agent: context.agentId,
    task_tree: context.taskTreeId,
  })[scope];

/** Whose calls a scope's budget counts. */
const callsOf = (scope: BudgetScope, scopeId: string): SpendScope =>
  ({
    organization: { organizationId: scopeId },
    project: { projectId: scopeId },
    agent: { agentId: scopeId },
    task_tree: { taskTreeId: scopeId },
  })[scope];

/**
 * Budgets for model calls (docs/models.md, Budgets; docs/pylon.md): an
 * organization's, a project's and an agent's per calendar month, a task
 * tree's over its life. What was spent is summed from the calls Pylon
 * recorded. Every call is checked before it's made (`exhausted`) and
 * counted after (`afterCall`, which announces thresholds and exhaustion
 * once per window); Hephaestus pauses tasks on a refused call and asks
 * `exhausted` before resuming them.
 */
@Injectable()
export class BudgetsService {
  constructor(
    @InjectRepository(BudgetEntity)
    private readonly budgets: Repository<BudgetEntity>,
    private readonly mapper: BudgetMapper,
    private readonly calls: ModelCallsService,
    private readonly tenancy: TenancyService,
    private readonly events: PylonEvents,
    private readonly access: AccessControl,
  ) {}

  get(
    organizationId: string,
    scope: BudgetScope,
    scopeId: string,
  ): Promise<ApiTypes.BudgetResponse> {
    return this.read(organizationId, scope, scopeId);
  }

  /**
   * Sets (or, with null, removes) a limit. The caller checked the agent or
   * the task tree's project permission; Polis is asked here.
   */
  @Transactional()
  async set(
    owner: { organizationId: string; projectId: string | null },
    scope: BudgetScope,
    scopeId: string,
    limitUsd: string | null,
  ): Promise<ApiTypes.BudgetResponse> {
    if (owner.projectId) {
      await this.tenancy.assertProjectAcceptsWrites(
        owner.organizationId,
        owner.projectId,
      );
    } else {
      await this.tenancy.assertOrganizationAcceptsWrites(owner.organizationId);
    }
    const now = new Date();
    const limit = limitUsd === null ? null : fromMicros(toMicros(limitUsd));
    let budget = await this.budgets.findOne({
      where: { organizationId: owner.organizationId, scope, scopeId },
      lock: { mode: 'pessimistic_write' },
    });
    budget ??= this.mapper.toEntity(owner, scope, scopeId, now);
    if (budget.version === 0 || budget.limitUsd !== limit) {
      budget.limitUsd = limit;
      // A new limit is announced again when it nears it, or runs out.
      budget.thresholdWindow = null;
      budget.exhaustedWindow = null;
      budget.version += 1;
      budget.updatedBy = this.access.principal().sub;
      budget.updatedAt = now;
      await this.budgets.save(budget);
      await this.events.emit({
        eventType: 'budget.changed',
        aggregateId: budget.id,
        aggregateVersion: budget.version,
        organizationId: budget.organizationId,
        projectId: budget.projectId,
        payload: {
          budgetId: budget.id,
          scope,
          scopeId,
          limitUsd: limit,
        },
      });
    }
    return this.toResponse(scope, scopeId, budget, now);
  }

  /** The narrowest of the context's budgets that ran out, or null. */
  async exhausted(
    context: BudgetContext,
    at = new Date(),
  ): Promise<ExhaustedBudget | null> {
    for (const { budget, spent, limit } of await this.limited(context, at)) {
      if (reached(spent, limit)) {
        return { scope: budget.scope, scopeId: budget.scopeId };
      }
    }
    return null;
  }

  /**
   * After a call: announces each budget that reached its threshold
   * (`budget.threshold-reached`) or ran out (`budget.exhausted`), once per
   * window.
   */
  @Transactional()
  async afterCall(context: BudgetContext, at = new Date()): Promise<void> {
    for (const { budget, spent, limit, window } of await this.limited(
      context,
      at,
    )) {
      if (
        budget.thresholdWindow !== window.key &&
        reached(spent, limit, THRESHOLD_PERCENT)
      ) {
        await this.announce(budget, 'budget.threshold-reached', spent, window);
      }
      if (budget.exhaustedWindow !== window.key && reached(spent, limit)) {
        await this.announce(budget, 'budget.exhausted', spent, window);
      }
    }
  }

  private async read(
    organizationId: string,
    scope: BudgetScope,
    scopeId: string,
  ): Promise<ApiTypes.BudgetResponse> {
    const budget = await this.budgets.findOneBy({
      organizationId,
      scope,
      scopeId,
    });
    return this.toResponse(scope, scopeId, budget, new Date());
  }

  /** The context's budgets with a limit, narrowest first, with what they spent. */
  private async limited(context: BudgetContext, at: Date) {
    const named = SCOPES.flatMap((scope) => {
      const scopeId = scopeIdOf(context, scope);
      return scopeId ? [{ scope, scopeId }] : [];
    });
    const rows = await this.budgets.find({
      where: named.map(({ scope, scopeId }) => ({
        organizationId: context.organizationId,
        scope,
        scopeId,
      })),
    });
    const limited = [];
    for (const { scope } of named) {
      const budget = rows.find((row) => row.scope === scope);
      if (!budget?.limitUsd) continue;
      const window = windowOf(scope, at);
      const spent = toMicros(await this.spent(scope, budget.scopeId, window));
      limited.push({ budget, spent, limit: toMicros(budget.limitUsd), window });
    }
    return limited;
  }

  private spent(
    scope: BudgetScope,
    scopeId: string,
    window: BudgetWindow,
  ): Promise<string> {
    return this.calls.spent(callsOf(scope, scopeId), window.start);
  }

  private async announce(
    budget: BudgetEntity,
    eventType: 'budget.threshold-reached' | 'budget.exhausted',
    spent: bigint,
    window: BudgetWindow,
  ): Promise<void> {
    const field =
      eventType === 'budget.exhausted' ? 'exhaustedWindow' : 'thresholdWindow';
    // Once per window, also when two calls race to it.
    const locked = await this.budgets.findOne({
      where: { id: budget.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!locked?.limitUsd || locked[field] === window.key) {
      return;
    }
    locked[field] = window.key;
    locked.version += 1;
    await this.budgets.save(locked);
    budget[field] = window.key;
    await this.events.emit({
      eventType,
      aggregateId: locked.id,
      aggregateVersion: locked.version,
      organizationId: locked.organizationId,
      projectId: locked.projectId,
      payload: {
        budgetId: locked.id,
        scope: locked.scope,
        scopeId: locked.scopeId,
        limitUsd: locked.limitUsd,
        spentUsd: fromMicros(spent),
        windowStart: window.start?.toISOString() ?? null,
      },
    });
  }

  private async toResponse(
    scope: BudgetScope,
    scopeId: string,
    budget: BudgetEntity | null,
    at: Date,
  ): Promise<ApiTypes.BudgetResponse> {
    const window = windowOf(scope, at);
    return this.mapper.toResponse(
      scope,
      scopeId,
      budget,
      await this.spent(scope, scopeId, window),
      window,
    );
  }
}
