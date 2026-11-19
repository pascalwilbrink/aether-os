import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { findPage, mapPage, type Page } from '@hephaestus/core';
import { ModelGateway } from '@hephaestus/models';
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
    private readonly gateway: ModelGateway,
    private readonly workspaces: WorkspacesService,
  ) {}

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
      this.gateway.usageOf(ids),
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
