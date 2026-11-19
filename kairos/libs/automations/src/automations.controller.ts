import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { RequirePermission, ZodSerializerDto } from '@kairos/core';

import { AutomationRunsService } from './automation-runs.service.js';
import { AutomationsService } from './automations.service.js';
import {
  AutomationPage,
  AutomationParams,
  AutomationRequest,
  AutomationResponse,
  AutomationRunPage,
  AutomationsParams,
  ListAutomationRunsQuery,
  ListAutomationsQuery,
} from './dto/automation.dto.js';

const IN_PROJECT = { project: 'projectId' };

/** A project's automations and their runs (docs/automations.md). */
@Controller('organizations/:organizationId/projects/:projectId/automations')
export class AutomationsController {
  constructor(
    private readonly automations: AutomationsService,
    private readonly runs: AutomationRunsService,
  ) {}

  @Get()
  @RequirePermission('automation:read', IN_PROJECT)
  @ZodSerializerDto(AutomationPage)
  list(
    @Param() { organizationId, projectId }: AutomationsParams,
    @Query() query: ListAutomationsQuery,
  ) {
    return this.automations.list(organizationId, projectId, query);
  }

  @Post()
  @RequirePermission('automation:manage', IN_PROJECT)
  @ZodSerializerDto(AutomationResponse)
  create(
    @Param() { organizationId, projectId }: AutomationsParams,
    @Body() body: AutomationRequest,
  ) {
    return this.automations.create(organizationId, projectId, body);
  }

  @Get(':automationId')
  @RequirePermission('automation:read', IN_PROJECT)
  @ZodSerializerDto(AutomationResponse)
  get(@Param() { organizationId, projectId, automationId }: AutomationParams) {
    return this.automations.get(organizationId, projectId, automationId);
  }

  @Put(':automationId')
  @RequirePermission('automation:manage', IN_PROJECT)
  @ZodSerializerDto(AutomationResponse)
  update(
    @Param() { organizationId, projectId, automationId }: AutomationParams,
    @Body() body: AutomationRequest,
  ) {
    return this.automations.update(
      organizationId,
      projectId,
      automationId,
      body,
    );
  }

  @Post(':automationId/pause')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('automation:manage', IN_PROJECT)
  @ZodSerializerDto(AutomationResponse)
  pause(
    @Param() { organizationId, projectId, automationId }: AutomationParams,
  ) {
    return this.automations.pause(organizationId, projectId, automationId);
  }

  @Post(':automationId/resume')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('automation:manage', IN_PROJECT)
  @ZodSerializerDto(AutomationResponse)
  resume(
    @Param() { organizationId, projectId, automationId }: AutomationParams,
  ) {
    return this.automations.resume(organizationId, projectId, automationId);
  }

  @Post(':automationId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('automation:manage', IN_PROJECT)
  @ZodSerializerDto(AutomationResponse)
  archive(
    @Param() { organizationId, projectId, automationId }: AutomationParams,
  ) {
    return this.automations.archive(organizationId, projectId, automationId);
  }

  @Get(':automationId/runs')
  @RequirePermission('automation:read', IN_PROJECT)
  @ZodSerializerDto(AutomationRunPage)
  listRuns(
    @Param() { organizationId, projectId, automationId }: AutomationParams,
    @Query() query: ListAutomationRunsQuery,
  ) {
    return this.runs.list(organizationId, projectId, automationId, query);
  }
}
