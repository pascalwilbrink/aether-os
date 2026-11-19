import { Controller, Get, Param, Query } from '@nestjs/common';

import { RequirePermission, ZodSerializerDto } from '@hephaestus/core';

import { ExecutionPage } from './dto/execution-page.response.js';
import { ExecutionsParams } from './dto/executions.params.js';
import { ListExecutionsQuery } from './dto/list-executions.query.js';
import { ExecutionHistory } from './execution-history.js';

@Controller(
  'organizations/:organizationId/projects/:projectId/tasks/:taskId/executions',
)
export class ExecutionsController {
  constructor(private readonly executions: ExecutionHistory) {}

  @Get()
  @RequirePermission('task:read', { project: 'projectId' })
  @ZodSerializerDto(ExecutionPage)
  list(
    @Param() { organizationId, projectId, taskId }: ExecutionsParams,
    @Query() query: ListExecutionsQuery,
  ) {
    return this.executions.list(organizationId, projectId, taskId, query);
  }
}
