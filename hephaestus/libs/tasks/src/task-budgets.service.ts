import { Injectable } from '@nestjs/common';

import { Transactional, type ApiTypes } from '@hephaestus/core';
import { Pylon } from '@hephaestus/models';
import { ProjectsService } from '@hephaestus/tenancy';

import type { CreateTaskRequest } from './dto/create-task.request.js';
import type { TaskResponse } from './dto/task.response.js';
import { TaskBudgetInvalidError } from './task.errors.js';
import { TaskContextSource, type PinnedKnowledge } from './task-context.js';
import { TasksService } from './tasks.service.js';

/**
 * A task tree's budget (docs/models.md, Budgets): Pylon's, by the tree's
 * top-level task (../docs/pylon.md). Set when the task is created
 * (`budgetUsd`), before its transaction commits, so the runner never sees
 * the tree without it; read and changed through any task of the tree.
 * Setting it takes the caller's own token: Pylon checks `task:create` in
 * the project, as Hephaestus does.
 */
@Injectable()
export class TaskBudgetsService {
  constructor(
    private readonly tasks: TasksService,
    private readonly pylon: Pylon,
    private readonly projects: ProjectsService,
    private readonly contextSource: TaskContextSource,
  ) {}

  /**
   * `callerToken` is the request's bearer token; null for a `task.create`
   * command, which can't carry a budget (there is no token of the sender's
   * to set it with).
   */
  @Transactional()
  async create(
    organizationId: string,
    projectId: string,
    dto: CreateTaskRequest,
    idempotencyKey: string,
    callerToken: string | null,
  ): Promise<{ task: TaskResponse; created: boolean }> {
    const budgetUsd = dto.budgetUsd ?? null;
    if (budgetUsd !== null && dto.parentTaskId) {
      throw new TaskBudgetInvalidError();
    }
    if (budgetUsd !== null && !callerToken) {
      throw new TaskBudgetInvalidError(
        "A task.create command can't set a budget: set it through the API.",
      );
    }
    const context = await this.pin(
      organizationId,
      projectId,
      dto,
      idempotencyKey,
    );
    const result = await this.tasks.create(
      organizationId,
      projectId,
      dto,
      idempotencyKey,
      undefined,
      context,
    );
    if (result.created && budgetUsd !== null && callerToken) {
      // Pylon refusing or not answering rolls the task back.
      await this.pylon.setTaskTreeBudget(
        organizationId,
        projectId,
        result.task.id,
        budgetUsd,
        callerToken,
      );
    }
    return result;
  }

  /**
   * The knowledge the request names, pinned at its current versions; none
   * when the idempotency key already made the task (it has its own).
   */
  private async pin(
    organizationId: string,
    projectId: string,
    dto: CreateTaskRequest,
    idempotencyKey: string,
  ): Promise<PinnedKnowledge[]> {
    const itemIds = (dto.context ?? []).map((entry) => entry.itemId);
    if (
      itemIds.length === 0 ||
      (await this.tasks.findByIdempotencyKey(organizationId, idempotencyKey))
    ) {
      return [];
    }
    return this.contextSource.pin(organizationId, projectId, itemIds);
  }

  async get(
    organizationId: string,
    projectId: string,
    taskId: string,
  ): Promise<ApiTypes.BudgetResponse> {
    const task = await this.tasks.findById(organizationId, projectId, taskId);
    return this.pylon.taskTreeBudget(
      organizationId,
      projectId,
      task.topLevelTaskId,
    );
  }

  async set(
    organizationId: string,
    projectId: string,
    taskId: string,
    limitUsd: string | null,
    callerToken: string,
  ): Promise<ApiTypes.BudgetResponse> {
    await this.projects.assertAcceptsWrites(organizationId, projectId);
    const task = await this.tasks.findById(organizationId, projectId, taskId);
    return this.pylon.setTaskTreeBudget(
      organizationId,
      projectId,
      task.topLevelTaskId,
      limitUsd,
      callerToken,
    );
  }
}
