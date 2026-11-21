import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { findPage, mapPage, type Page } from '@hephaestus/core';
import { Pylon } from '@hephaestus/models';
import { TasksService } from '@hephaestus/tasks';
import { WorkspacesService } from '@hephaestus/workspaces';

import type { ExecutionResponse } from './dto/execution.response.js';
import type { ListExecutionsQuery } from './dto/list-executions.query.js';
import { ExecutionEntity } from './execution.entity.js';
import { ExecutionMapper } from './execution.mapper.js';

/**
 * A task's executions as people read them (`GET …/executions`): each with
 * its model usage and its sandbox (what it could reach and what its proxy
 * refused). The runner's side of executions is `ExecutionsService`.
 */
@Injectable()
export class ExecutionHistory {
  constructor(
    @InjectRepository(ExecutionEntity)
    private readonly executions: Repository<ExecutionEntity>,
    private readonly mapper: ExecutionMapper,
    private readonly tasks: TasksService,
    private readonly pylon: Pylon,
    private readonly workspaces: WorkspacesService,
  ) {}

  /** An execution's status; 404 when it isn't one of this task's. */
  async statusOf(
    organizationId: string,
    projectId: string,
    taskId: string,
    executionId: string,
  ): Promise<ExecutionResponse['status']> {
    await this.tasks.findById(organizationId, projectId, taskId);
    const execution = await this.executions.findOne({
      where: { id: executionId, taskId },
      select: { id: true, status: true },
    });
    if (!execution) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }
    return execution.status;
  }

  async list(
    organizationId: string,
    projectId: string,
    taskId: string,
    page: ListExecutionsQuery,
  ): Promise<Page<ExecutionResponse>> {
    // 404 for another organization's or project's task.
    await this.tasks.findById(organizationId, projectId, taskId);
    const entities = await findPage(
      this.executions,
      { where: { taskId }, sortBy: 'startedAt', direction: 'DESC' },
      page,
    );
    const ids = entities.items.map((entity) => entity.id);
    const [usage, sandboxes] = await Promise.all([
      this.pylon.usageOf(organizationId, ids),
      this.workspaces.sandboxesOf(organizationId, ids),
    ]);
    return mapPage(entities, (entity) =>
      this.mapper.toResponse(
        entity,
        usage.get(entity.id),
        sandboxes.get(entity.id) ?? null,
      ),
    );
  }
}
