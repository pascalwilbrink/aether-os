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

import {
  PlatformAccess,
  RequirePermission,
  ZodSerializerDto,
} from '@polis/core';

import { CreateProjectRequest } from './dto/create-project.request.js';
import { ListProjectsQuery } from './dto/list-projects.query.js';
import { ProjectPage } from './dto/project-page.response.js';
import { ProjectParams } from './dto/project.params.js';
import { ProjectResponse } from './dto/project.response.js';
import { ProjectsParams } from './dto/projects.params.js';
import { SetProjectDepartmentRequest } from './dto/set-project-department.request.js';
import { ProjectsService } from './projects.service.js';

@Controller('organizations/:organizationId/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @RequirePermission('project:create')
  @ZodSerializerDto(ProjectResponse)
  create(
    @Param() { organizationId }: ProjectsParams,
    @Body() body: CreateProjectRequest,
  ) {
    return this.projects.create(organizationId, body);
  }

  @Get()
  @RequirePermission('org:read')
  @PlatformAccess('platform:read')
  @ZodSerializerDto(ProjectPage)
  list(
    @Param() { organizationId }: ProjectsParams,
    @Query() query: ListProjectsQuery,
  ) {
    return this.projects.list(organizationId, query);
  }

  @Get(':projectId')
  @RequirePermission('project:read', { project: 'projectId' })
  @PlatformAccess('platform:read')
  @ZodSerializerDto(ProjectResponse)
  findById(@Param() { organizationId, projectId }: ProjectParams) {
    return this.projects.findById(organizationId, projectId);
  }

  @Post(':projectId/archive')
  @RequirePermission('project:manage', { project: 'projectId' })
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(ProjectResponse)
  archive(@Param() { organizationId, projectId }: ProjectParams) {
    return this.projects.archive(organizationId, projectId);
  }

  @Put(':projectId/department')
  @RequirePermission('project:manage', { project: 'projectId' })
  @ZodSerializerDto(ProjectResponse)
  setDepartment(
    @Param() { organizationId, projectId }: ProjectParams,
    @Body() body: SetProjectDepartmentRequest,
  ) {
    return this.projects.setDepartment(organizationId, projectId, body);
  }
}
