import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  AccessControl,
  HephaestusEvents,
  Transactional,
  type ApiTypes,
} from '@hephaestus/core';
import { OrganizationsService, ProjectsService } from '@hephaestus/tenancy';

import {
  reached,
  THRESHOLD_PERCENT,
  windowOf,
  type BudgetWindow,
} from './budget-window.js';
import { BudgetEntity, type BudgetScope } from './budget.entity.js';
import { BudgetMapper } from './budget.mapper.js';
import { fromMicros, toMicros } from './model-cost.js';
import { ModelGateway } from './model-gateway.js';

/** The budgets a task's model calls count against. */
export interface BudgetContext {
  organizationId: string;
  projectId: string;
  topLevelTaskId: string;
}

/** A budget ran out; the task pauses (docs/models.md, Budgets). */
export class BudgetExceededError extends Error {
  constructor(readonly scope: BudgetScope) {
    super(`The ${scope.replace('_', ' ')} budget ran out`);
    this.name = 'BudgetExceededError';
  }
}

/** Checked narrowest first: the budget that ran out is the one named. */
const SCOPES: BudgetScope[] = ['task_tree', 'project', 'organization'];

const scopeIdOf = (context: BudgetContext, scope: BudgetScope) =>
  scope === 'organization'
    ? context.organizationId
    : scope === 'project'
      ? context.projectId
      : context.topLevelTaskId;

/**
 * Budgets for model calls (docs/models.md, Budgets): an organization's and a
 * project's per calendar month, a task tree's over its life. What was spent
 * is summed from the calls the gateway recorded (their cost at the price in
 * force). The runner checks them before an execution starts and after each
 * model call; a task whose budget ran out pauses, and resumes once it has
 * room again (raised, or a new month).
 */
@Injectable()
export class BudgetsService {
  constructor(
    @InjectRepository(BudgetEntity)
    private readonly budgets: Repository<BudgetEntity>,
    private readonly mapper: BudgetMapper,
    private readonly gateway: ModelGateway,
    private readonly organizations: OrganizationsService,
    private readonly projects: ProjectsService,
    private readonly events: HephaestusEvents,
    private readonly access: AccessControl,
  ) {}

  getOrganization(organizationId: string): Promise<ApiTypes.BudgetResponse> {
    return this.get(organizationId, 'organization', organizationId);
  }

  async setOrganization(
    organizationId: string,
    limitUsd: string | null,
  ): Promise<ApiTypes.BudgetResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);
    return this.set(
      { organizationId, projectId: null },
      'organization',
      organizationId,
      limitUsd,
    );
  }

  getProject(
    organizationId: string,
    projectId: string,
  ): Promise<ApiTypes.BudgetResponse> {
    return this.get(organizationId, 'project', projectId);
  }

  async setProject(
    organizationId: string,
    projectId: string,
    limitUsd: string | null,
  ): Promise<ApiTypes.BudgetResponse> {
    await this.projects.assertAcceptsWrites(organizationId, projectId);
    return this.set(
      { organizationId, projectId },
      'project',
      projectId,
      limitUsd,
    );
  }

  /** A task tree's budget; the caller checked the task and its project. */
  getTaskTree(
    organizationId: string,
    topLevelTaskId: string,
  ): Promise<ApiTypes.BudgetResponse> {
    return this.get(organizationId, 'task_tree', topLevelTaskId);
  }

  /** Sets a task tree's budget; the caller checked the task and its project. */
  setTaskTree(
    organizationId: string,
    projectId: string,
    topLevelTaskId: string,
    limitUsd: string | null,
  ): Promise<ApiTypes.BudgetResponse> {
    return this.set(
      { organizationId, projectId },
      'task_tree',
      topLevelTaskId,
      limitUsd,
    );
  }

  /** The narrowest of the context's budgets that ran out, or null. */
  async exceeded(
    context: BudgetContext,
    at = new Date(),
  ): Promise<BudgetScope | null> {
    for (const { budget, spent, limit } of await this.limited(context, at)) {
      if (reached(spent, limit)) {
        return budget.scope;
      }
    }
    return null;
  }

  /**
   * After a model call: announces each budget that reached its threshold
   * (`budget.threshold-reached`, once per window), and returns the
   * narrowest one that ran out, or null.
   */
  @Transactional()
  async afterCall(
    context: BudgetContext,
    at = new Date(),
  ): Promise<BudgetScope | null> {
    let ranOut: BudgetScope | null = null;
    for (const { budget, spent, limit, window } of await this.limited(
      context,
      at,
    )) {
      if (
        budget.thresholdWindow !== window.key &&
        reached(spent, limit, THRESHOLD_PERCENT)
      ) {
        await this.announceThreshold(budget, spent, window);
      }
      ranOut ??= reached(spent, limit) ? budget.scope : null;
    }
    return ranOut;
  }

  private async get(
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

  @Transactional()
  private async set(
    owner: { organizationId: string; projectId: string | null },
    scope: BudgetScope,
    scopeId: string,
    limitUsd: string | null,
  ): Promise<ApiTypes.BudgetResponse> {
    const now = new Date();
    const limit = limitUsd === null ? null : fromMicros(toMicros(limitUsd));
    let budget = await this.budgets.findOne({
      where: { organizationId: owner.organizationId, scope, scopeId },
      lock: { mode: 'pessimistic_write' },
    });
    budget ??= this.mapper.toEntity(owner, scope, scopeId, now);
    if (budget.version === 0 || budget.limitUsd !== limit) {
      budget.limitUsd = limit;
      // A new limit is announced again when it nears it.
      budget.thresholdWindow = null;
      budget.version += 1;
      budget.updatedBy = this.access.principal().sub;
      budget.updatedAt = now;
      await this.budgets.save(budget);
    }
    return this.toResponse(scope, scopeId, budget, now);
  }

  /** The context's budgets with a limit, narrowest first, with what they spent. */
  private async limited(context: BudgetContext, at: Date) {
    const rows = await this.budgets.find({
      where: SCOPES.map((scope) => ({
        organizationId: context.organizationId,
        scope,
        scopeId: scopeIdOf(context, scope),
      })),
    });
    const limited = [];
    for (const scope of SCOPES) {
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
    return this.gateway.spent(
      scope === 'organization'
        ? { organizationId: scopeId }
        : scope === 'project'
          ? { projectId: scopeId }
          : { topLevelTaskId: scopeId },
      window.start,
    );
  }

  private async announceThreshold(
    budget: BudgetEntity,
    spent: bigint,
    window: BudgetWindow,
  ): Promise<void> {
    // Once per window, also when two calls race to it.
    const locked = await this.budgets.findOne({
      where: { id: budget.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!locked || locked.thresholdWindow === window.key) {
      return;
    }
    locked.thresholdWindow = window.key;
    locked.version += 1;
    await this.budgets.save(locked);
    await this.events.emit({
      eventType: 'budget.threshold-reached',
      aggregateId: locked.id,
      aggregateVersion: locked.version,
      organizationId: locked.organizationId,
      projectId: locked.projectId ?? undefined,
      payload: {
        budgetId: locked.id,
        scope: locked.scope,
        scopeId: locked.scopeId,
        limitUsd: locked.limitUsd!,
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
