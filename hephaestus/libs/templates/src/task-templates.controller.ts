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

import { RequirePermission, ZodSerializerDto } from '@hephaestus/core';

import { CreateTaskTemplateRequest } from './dto/create-task-template.request.js';
import { ListTaskTemplateVersionsQuery } from './dto/list-task-template-versions.query.js';
import { ListTaskTemplatesQuery } from './dto/list-task-templates.query.js';
import { TaskTemplateContentRequest } from './dto/task-template-content.request.js';
import { TaskTemplatePage } from './dto/task-template-page.response.js';
import { TaskTemplateVersionPage } from './dto/task-template-version-page.response.js';
import { TaskTemplateVersionParams } from './dto/task-template-version.params.js';
import { TaskTemplateVersionResponse } from './dto/task-template-version.response.js';
import { TaskTemplateParams } from './dto/task-template.params.js';
import { TaskTemplateResponse } from './dto/task-template.response.js';
import { TaskTemplatesParams } from './dto/task-templates.params.js';
import { TaskTemplatesService } from './task-templates.service.js';

/**
 * Every route needs an organization token (`org:read`);
 * `TaskTemplatesService` checks the scope's permission once it knows the
 * template's scope.
 */
@Controller('organizations/:organizationId/task-templates')
export class TaskTemplatesController {
  constructor(private readonly templates: TaskTemplatesService) {}

  @Post()
  @RequirePermission('org:read')
  @ZodSerializerDto(TaskTemplateResponse)
  create(
    @Param() { organizationId }: TaskTemplatesParams,
    @Body() body: CreateTaskTemplateRequest,
  ) {
    return this.templates.create(organizationId, body);
  }

  @Get()
  @RequirePermission('org:read')
  @ZodSerializerDto(TaskTemplatePage)
  list(
    @Param() { organizationId }: TaskTemplatesParams,
    @Query() { projectId, ...page }: ListTaskTemplatesQuery,
  ) {
    return this.templates.list(organizationId, projectId, page);
  }

  @Get(':templateId')
  @RequirePermission('org:read')
  @ZodSerializerDto(TaskTemplateResponse)
  findById(@Param() { organizationId, templateId }: TaskTemplateParams) {
    return this.templates.findById(organizationId, templateId);
  }

  @Post(':templateId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('org:read')
  @ZodSerializerDto(TaskTemplateResponse)
  archive(@Param() { organizationId, templateId }: TaskTemplateParams) {
    return this.templates.archive(organizationId, templateId);
  }

  @Post(':templateId/versions')
  @RequirePermission('org:read')
  @ZodSerializerDto(TaskTemplateVersionResponse)
  createVersion(
    @Param() { organizationId, templateId }: TaskTemplateParams,
    @Body() body: TaskTemplateContentRequest,
  ) {
    return this.templates.createVersion(organizationId, templateId, body);
  }

  @Get(':templateId/versions')
  @RequirePermission('org:read')
  @ZodSerializerDto(TaskTemplateVersionPage)
  listVersions(
    @Param() { organizationId, templateId }: TaskTemplateParams,
    @Query() page: ListTaskTemplateVersionsQuery,
  ) {
    return this.templates.listVersions(organizationId, templateId, page);
  }

  @Get(':templateId/versions/:version')
  @RequirePermission('org:read')
  @ZodSerializerDto(TaskTemplateVersionResponse)
  findVersion(
    @Param() { organizationId, templateId, version }: TaskTemplateVersionParams,
  ) {
    return this.templates.findVersion(organizationId, templateId, version);
  }
}
