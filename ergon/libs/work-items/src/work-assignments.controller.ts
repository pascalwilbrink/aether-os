import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { RequirePermission, ZodSerializerDto } from '@ergon/core';

import {
  AssignmentParams,
  ListWorkAssignmentsQuery,
  WorkAssignmentEndRequest,
  WorkAssignmentPage,
  WorkAssignmentRequest,
  WorkAssignmentResponse,
  WorkItemParams,
} from './dto/work-item.dto.js';
import { WorkAssignmentsService } from './work-assignments.service.js';

/** A work item's assignments; permissions as for the work item (`WorkAccess`). */
@Controller('organizations/:organizationId/work-items/:workItemId/assignments')
export class WorkAssignmentsController {
  constructor(private readonly assignments: WorkAssignmentsService) {}

  @Get()
  @RequirePermission('org:read')
  @ZodSerializerDto(WorkAssignmentPage)
  list(
    @Param() { organizationId, workItemId }: WorkItemParams,
    @Query() query: ListWorkAssignmentsQuery,
  ) {
    return this.assignments.list(organizationId, workItemId, query);
  }

  @Post()
  @RequirePermission('org:read')
  @ZodSerializerDto(WorkAssignmentResponse)
  create(
    @Param() { organizationId, workItemId }: WorkItemParams,
    @Body() body: WorkAssignmentRequest,
  ) {
    return this.assignments.create(organizationId, workItemId, body);
  }

  @Post(':assignmentId/end')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('org:read')
  @ZodSerializerDto(WorkAssignmentResponse)
  end(
    @Param() { organizationId, workItemId, assignmentId }: AssignmentParams,
    @Body() body: WorkAssignmentEndRequest,
  ) {
    return this.assignments.end(
      organizationId,
      workItemId,
      assignmentId,
      body.reason,
    );
  }
}
