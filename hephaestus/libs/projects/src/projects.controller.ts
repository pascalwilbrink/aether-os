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

import { ZodSerializerDto } from '@hephaestus/core';

import { CreateProjectRequest } from './dto/create-project.request.js';
import { ListProjectsQuery } from './dto/list-projects.query.js';
import { ProjectPage } from './dto/project-page.response.js';
import { ProjectParams } from './dto/project.params.js';
import { ProjectResponse } from './dto/project.response.js';
import { ProjectsParams } from './dto/projects.params.js';
import { ProjectsService } from './projects.service.js';

@Controller('organizations/:organizationId/projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @ZodSerializerDto(ProjectResponse)
  create(
    @Param() { organizationId }: ProjectsParams,
    @Body() body: CreateProjectRequest,
  ) {
    return this.projects.create(organizationId, body);
  }

  @Get()
  @ZodSerializerDto(ProjectPage)
  list(
    @Param() { organizationId }: ProjectsParams,
    @Query() query: ListProjectsQuery,
  ) {
    return this.projects.list(organizationId, query);
  }

  @Get(':projectId')
  @ZodSerializerDto(ProjectResponse)
  findById(@Param() { organizationId, projectId }: ProjectParams) {
    return this.projects.findById(organizationId, projectId);
  }

  @Post(':projectId/archive')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(ProjectResponse)
  archive(@Param() { organizationId, projectId }: ProjectParams) {
    return this.projects.archive(organizationId, projectId);
  }
}
