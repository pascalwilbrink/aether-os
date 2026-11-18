import { Injectable } from '@nestjs/common';

import { Transactional, type ApiTypes } from '@hephaestus/core';
import { BudgetsService } from '@hephaestus/models';
import { ProjectsService } from '@hephaestus/tenancy';

import type { CreateTaskRequest } from './dto/create-task.request.js';
import type { TaskResponse } from './dto/task.response.js';
import { TaskBudgetInvalidError } from './task.errors.js';
import { TasksService } from './tasks.service.js';

/**
 * A task tree's budget (docs/models.md, Budgets): on its top-level task,
 * for the tree's whole life. Set when the task is created (`budgetUsd`), in
 * the same transaction, so the runner never sees the tree without it; read
 * and changed through any task of the tree.
 */
@Injectable()
export class TaskBudgetsService {
  constructor(
    private readonly tasks: TasksService,
    private readonly budgets: BudgetsService,
    private readonly projects: ProjectsService,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    projectId: string,
    dto: CreateTaskRequest,
    idempotencyKey: string,
  ): Promise<{ task: TaskResponse; created: boolean }> {
    const budgetUsd = dto.budgetUsd ?? null;
    if (budgetUsd !== null && dto.parentTaskId) {
      throw new TaskBudgetInvalidError();
    }
    const result = await this.tasks.create(
      organizationId,
      projectId,
      dto,
      idempotencyKey,
    );
    if (result.created && budgetUsd !== null) {
      await this.budgets.setTaskTree(
        organizationId,
        projectId,
        result.task.id,
        budgetUsd,
      );
    }
    return result;
  }

  async get(
    organizationId: string,
    projectId: string,
    taskId: string,
  ): Promise<ApiTypes.BudgetResponse> {
    const task = await this.tasks.findById(organizationId, projectId, taskId);
    return this.budgets.getTaskTree(organizationId, task.topLevelTaskId);
  }

  async set(
    organizationId: string,
    projectId: string,
    taskId: string,
    limitUsd: string | null,
  ): Promise<ApiTypes.BudgetResponse> {
    await this.projects.assertAcceptsWrites(organizationId, projectId);
    const task = await this.tasks.findById(organizationId, projectId, taskId);
    return this.budgets.setTaskTree(
      organizationId,
      projectId,
      task.topLevelTaskId,
      limitUsd,
    );
  }
}
