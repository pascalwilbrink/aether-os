import { HttpException } from '@nestjs/common';

import {
  createPylonHttpClient,
  ProblemException,
  PylonApi,
  ServiceTokens,
  type ApiTypes,
} from '@hephaestus/core';

import { PylonUnavailableError, type BudgetScope } from './model.errors.js';

/** The budgets a task's model calls count against. */
export interface TaskBudgets {
  organizationId: string;
  projectId: string;
  agentId: string;
  /** The task tree: its top-level task's ID. */
  topLevelTaskId: string;
}

/**
 * What Hephaestus asks of Pylon besides model calls (../docs/pylon.md):
 * whether a task's budgets have room, a task tree's budget, and what an
 * execution's calls used. Budgets, metering and the catalogue are Pylon's;
 * Hephaestus keeps none of it. Behind a port so tests can stand in for it.
 */
export abstract class Pylon {
  /** The narrowest budget of the task's that ran out, or null. */
  abstract exhausted(
    task: TaskBudgets,
  ): Promise<{ scope: BudgetScope; scopeId: string } | null>;

  /** A task tree's budget, read with Hephaestus's own token. */
  abstract taskTreeBudget(
    organizationId: string,
    projectId: string,
    taskTreeId: string,
  ): Promise<ApiTypes.BudgetResponse>;

  /**
   * Sets a task tree's budget with the caller's own token: Pylon checks
   * `task:create` in the project, as Hephaestus did.
   */
  abstract setTaskTreeBudget(
    organizationId: string,
    projectId: string,
    taskTreeId: string,
    limitUsd: string | null,
    callerToken: string,
  ): Promise<ApiTypes.BudgetResponse>;

  /** Calls, tokens and cost per execution, for those that made calls. */
  abstract usageOf(
    organizationId: string,
    executionIds: string[],
  ): Promise<Map<string, ApiTypes.ExecutionUsage>>;
}

/** At most this many executions per usage request (Pylon's limit). */
const USAGE_BATCH = 100;

/** Pylon's API through the generated client. */
export class HttpPylon extends Pylon {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceTokens: ServiceTokens,
    private readonly timeoutMs = 10_000,
  ) {
    super();
  }

  async exhausted(
    task: TaskBudgets,
  ): Promise<{ scope: BudgetScope; scopeId: string } | null> {
    const data = await this.call((client) =>
      PylonApi.checkBudgets({
        client,
        path: { organizationId: task.organizationId },
        body: {
          projectId: task.projectId,
          agentId: task.agentId,
          taskTreeId: task.topLevelTaskId,
        },
      }),
    );
    return data.exhausted ?? null;
  }

  taskTreeBudget(
    organizationId: string,
    projectId: string,
    taskTreeId: string,
  ): Promise<ApiTypes.BudgetResponse> {
    return this.call((client) =>
      PylonApi.getTaskTreeBudget({
        client,
        path: { organizationId, projectId, taskTreeId },
      }),
    );
  }

  setTaskTreeBudget(
    organizationId: string,
    projectId: string,
    taskTreeId: string,
    limitUsd: string | null,
    callerToken: string,
  ): Promise<ApiTypes.BudgetResponse> {
    return this.call(
      (client) =>
        PylonApi.setTaskTreeBudget({
          client,
          path: { organizationId, projectId, taskTreeId },
          body: { limitUsd },
        }),
      callerToken,
    );
  }

  async usageOf(
    organizationId: string,
    executionIds: string[],
  ): Promise<Map<string, ApiTypes.ExecutionUsage>> {
    const usage = new Map<string, ApiTypes.ExecutionUsage>();
    for (let i = 0; i < executionIds.length; i += USAGE_BATCH) {
      const data = await this.call((client) =>
        PylonApi.getUsage({
          client,
          path: { organizationId },
          query: {
            executionId: executionIds.slice(i, i + USAGE_BATCH),
            groupBy: 'execution',
          },
        }),
      );
      for (const { group, ...totals } of data.items) {
        if (group) usage.set(group, totals);
      }
    }
    return usage;
  }

  /**
   * One request, with Hephaestus's own token unless a caller's is given.
   * Pylon's problem details (403, 404, 409) are passed on as they came;
   * no answer, a 5xx or no token from Pistis is `PylonUnavailableError`.
   */
  private async call<T>(
    request: (
      client: ReturnType<typeof createPylonHttpClient>,
    ) => Promise<{ data?: T; error?: unknown; response?: Response }>,
    callerToken?: string,
  ): Promise<T> {
    let token: string;
    try {
      token = callerToken ?? (await this.serviceTokens.token());
    } catch (error) {
      throw new PylonUnavailableError(
        `no token from Pistis (${String(error)})`,
      );
    }
    const client = createPylonHttpClient({
      baseUrl: this.baseUrl,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(this.timeoutMs) }),
      auth: () => token,
    });
    let result: Awaited<ReturnType<typeof request>>;
    try {
      result = await request(client);
    } catch (error) {
      throw new PylonUnavailableError(String(error));
    }
    const status = result.response?.status ?? 0;
    if (result.data !== undefined && status >= 200 && status < 300) {
      return result.data;
    }
    if (status === 401 && !callerToken) {
      // A stale token of Hephaestus's own: the next request gets a new one.
      this.serviceTokens.invalidate();
    }
    if (status >= 400 && status < 500) {
      const problem = (result.error ?? {}) as {
        code?: string;
        detail?: string;
      };
      if (problem.code) {
        throw new ProblemException(
          status,
          problem.code,
          problem.detail ?? `Pylon answered ${status}`,
        );
      }
      throw new HttpException(`Pylon answered ${status}`, status);
    }
    throw new PylonUnavailableError(`HTTP ${status || '?'}`);
  }
}
