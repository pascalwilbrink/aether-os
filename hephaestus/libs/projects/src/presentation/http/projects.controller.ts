import { randomUUID } from 'node:crypto';

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

import {
  PageResponse,
  PaginationQuery,
  type OrganizationId,
  type ProjectId,
} from '@hephaestus/core';

import { ProjectService } from '../../application/service/project.service.js';
import { CreateProjectRequest } from './dto/create-project.request.js';
import { ProjectResponse } from './dto/project.response.js';

@Controller('organizations/:organizationId/projects')
export class ProjectsController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  async create(
    @Param('organizationId') organizationId: string,
    @Body() body: CreateProjectRequest,
  ): Promise<ProjectResponse> {
    const project = await this.projectService.create({
      id: randomUUID() as ProjectId,
      organizationId: organizationId as OrganizationId,
      name: body.name,
      slug: body.slug,
      description: body.description,
      createdBy: body.createdBy,
    });

    return ProjectResponse.fromDomain(project);
  }

  @Get()
  async list(
    @Param('organizationId') organizationId: string,
    @Query() query: PaginationQuery,
  ): Promise<PageResponse<ProjectResponse>> {
    const page = await this.projectService.list(
      organizationId as OrganizationId,
      query,
    );

    return PageResponse.fromPage(page, (project) =>
      ProjectResponse.fromDomain(project),
    );
  }

  @Get(':projectId')
  async findById(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
  ): Promise<ProjectResponse> {
    const project = await this.projectService.findById(
      organizationId as OrganizationId,
      projectId as ProjectId,
    );

    return ProjectResponse.fromDomain(project);
  }

  @Post(':projectId/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @Param('organizationId') organizationId: string,
    @Param('projectId') projectId: string,
  ): Promise<void> {
    await this.projectService.archive(
      organizationId as OrganizationId,
      projectId as ProjectId,
    );
  }
}
