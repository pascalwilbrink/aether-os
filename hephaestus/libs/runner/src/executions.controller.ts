import { Controller, Get, Param, Query } from '@nestjs/common';

import { RequirePermission, ZodSerializerDto } from '@hephaestus/core';

import { ExecutionPage } from './dto/execution-page.response.js';
import {
  ExecutionEventPage,
  ExecutionEventsParams,
  ListExecutionEventsQuery,
} from './dto/execution-events.dto.js';
import { ExecutionsParams } from './dto/executions.params.js';
import { ListExecutionsQuery } from './dto/list-executions.query.js';
import { ExecutionEventsService } from './execution-events.service.js';
import { ExecutionHistory } from './execution-history.js';

@Controller(
  'organizations/:organizationId/projects/:projectId/tasks/:taskId/executions',
)
export class ExecutionsController {
  constructor(
    private readonly executions: ExecutionHistory,
    private readonly activity: ExecutionEventsService,
  ) {}

  @Get()
  @RequirePermission('task:read', { project: 'projectId' })
  @ZodSerializerDto(ExecutionPage)
  list(
    @Param() { organizationId, projectId, taskId }: ExecutionsParams,
    @Query() query: ListExecutionsQuery,
  ) {
    return this.executions.list(organizationId, projectId, taskId, query);
  }

  /** What an execution did, as it happens (docs/tasks.md, Activity). */
  @Get(':executionId/events')
  @RequirePermission('task:read', { project: 'projectId' })
  @ZodSerializerDto(ExecutionEventPage)
  listEvents(
    @Param()
    { organizationId, projectId, taskId, executionId }: ExecutionEventsParams,
    @Query() query: ListExecutionEventsQuery,
  ) {
    return this.activity.list(
      organizationId,
      projectId,
      taskId,
      executionId,
      query,
    );
  }
}
