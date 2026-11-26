import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

import { RequirePermission, ZodSerializerDto } from '@ergon/core';

import {
  DependenciesParams,
  DependencyParams,
  WorkDependencyList,
  WorkDependencyRequest,
  WorkDependencyResponse,
  WorkItemParams,
} from './dto/work-item.dto.js';
import { WorkDependenciesService } from './work-dependencies.service.js';

/** Dependencies between work items; `work:write` on both to change one (`WorkAccess`). */
@Controller('organizations/:organizationId')
export class WorkDependenciesController {
  constructor(private readonly dependencies: WorkDependenciesService) {}

  @Get('work-items/:workItemId/dependencies')
  @RequirePermission('org:read')
  @ZodSerializerDto(WorkDependencyList)
  list(@Param() { organizationId, workItemId }: WorkItemParams) {
    return this.dependencies.listFor(organizationId, workItemId);
  }

  @Post('work-dependencies')
  @RequirePermission('org:read')
  @ZodSerializerDto(WorkDependencyResponse)
  create(
    @Param() { organizationId }: DependenciesParams,
    @Body() body: WorkDependencyRequest,
  ) {
    return this.dependencies.create(organizationId, body);
  }

  @Delete('work-dependencies/:dependencyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('org:read')
  async remove(@Param() { organizationId, dependencyId }: DependencyParams) {
    await this.dependencies.remove(organizationId, dependencyId);
  }
}
