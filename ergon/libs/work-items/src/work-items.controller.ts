import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { RequirePermission, ZodSerializerDto } from '@ergon/core';

import {
  ListWorkActivityQuery,
  ListWorkItemsQuery,
  OrganizationParams,
  WorkActivityPage,
  WorkItemPage,
  WorkItemParams,
  WorkItemRequest,
  WorkItemResponse,
  WorkItemTransitionRequest,
  WorkItemUpdate,
} from './dto/work-item.dto.js';
import { WorkItemsService } from './work-items.service.js';

/**
 * Work items and their activity. The route only checks the organization
 * (`org:read`): whether the caller may read or change a work item depends on
 * its project, which `WorkAccess` checks.
 */
@Controller('organizations/:organizationId/work-items')
export class WorkItemsController {
  constructor(private readonly workItems: WorkItemsService) {}

  @Get()
  @RequirePermission('org:read')
  @ZodSerializerDto(WorkItemPage)
  list(
    @Param() { organizationId }: OrganizationParams,
    @Query() query: ListWorkItemsQuery,
  ) {
    return this.workItems.list(organizationId, query);
  }

  @Post()
  @RequirePermission('org:read')
  @ZodSerializerDto(WorkItemResponse)
  create(
    @Param() { organizationId }: OrganizationParams,
    @Body() body: WorkItemRequest,
  ) {
    return this.workItems.create(organizationId, body);
  }

  @Get(':workItemId')
  @RequirePermission('org:read')
  @ZodSerializerDto(WorkItemResponse)
  get(@Param() { organizationId, workItemId }: WorkItemParams) {
    return this.workItems.get(organizationId, workItemId);
  }

  @Put(':workItemId')
  @RequirePermission('org:read')
  @ZodSerializerDto(WorkItemResponse)
  update(
    @Param() { organizationId, workItemId }: WorkItemParams,
    @Body() body: WorkItemUpdate,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.workItems.update(organizationId, workItemId, body, ifMatch);
  }

  @Post(':workItemId/transitions')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('org:read')
  @ZodSerializerDto(WorkItemResponse)
  transition(
    @Param() { organizationId, workItemId }: WorkItemParams,
    @Body() body: WorkItemTransitionRequest,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.workItems.transition(organizationId, workItemId, body, ifMatch);
  }

  @Get(':workItemId/activity')
  @RequirePermission('org:read')
  @ZodSerializerDto(WorkActivityPage)
  activity(
    @Param() { organizationId, workItemId }: WorkItemParams,
    @Query() query: ListWorkActivityQuery,
  ) {
    return this.workItems.listActivity(organizationId, workItemId, query);
  }
}
