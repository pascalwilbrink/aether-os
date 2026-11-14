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
  type ExecutionId,
  type OrganizationId,
  type ProjectId,
  type WorkspaceId,
} from '@hephaestus/core';

import { WorkspaceService } from '../../application/service/workspace.service.js';
import type { Workspace } from '../../domain/workspace.js';
import { CreateWorkspaceRequest } from './dto/create-workspace.request.js';
import { WorkspaceResponse } from './dto/workspace.response.js';

type UserAction = 'acquire' | 'release' | 'suspend' | 'resume' | 'destroy';

@Controller('organizations/:organizationId/workspaces')
export class WorkspacesController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post()
  async create(
    @Param('organizationId') organizationId: string,
    @Body() body: CreateWorkspaceRequest,
  ): Promise<WorkspaceResponse> {
    const workspace = await this.workspaceService.create({
      id: randomUUID() as WorkspaceId,
      organizationId: organizationId as OrganizationId,
      projectId: body.projectId as ProjectId,
      executionId: body.executionId as ExecutionId,
      repository: body.repository,
      sandbox: body.sandbox,
      workingDirectory: body.workingDirectory,
      expiresAt: body.expiresAt,
    });

    return WorkspaceResponse.fromDomain(workspace);
  }

  @Get()
  async list(
    @Param('organizationId') organizationId: string,
    @Query() query: PaginationQuery,
  ): Promise<PageResponse<WorkspaceResponse>> {
    const page = await this.workspaceService.list(
      organizationId as OrganizationId,
      query,
    );

    return PageResponse.fromPage(page, (workspace) =>
      WorkspaceResponse.fromDomain(workspace),
    );
  }

  @Get(':workspaceId')
  async findById(
    @Param('organizationId') organizationId: string,
    @Param('workspaceId') workspaceId: string,
  ): Promise<WorkspaceResponse> {
    const workspace = await this.workspaceService.findById(
      organizationId as OrganizationId,
      workspaceId as WorkspaceId,
    );

    return WorkspaceResponse.fromDomain(workspace);
  }

  @Post(':workspaceId/acquire')
  @HttpCode(HttpStatus.OK)
  acquire(
    @Param('organizationId') organizationId: string,
    @Param('workspaceId') workspaceId: string,
  ): Promise<WorkspaceResponse> {
    return this.run('acquire', organizationId, workspaceId);
  }

  @Post(':workspaceId/release')
  @HttpCode(HttpStatus.OK)
  release(
    @Param('organizationId') organizationId: string,
    @Param('workspaceId') workspaceId: string,
  ): Promise<WorkspaceResponse> {
    return this.run('release', organizationId, workspaceId);
  }

  @Post(':workspaceId/suspend')
  @HttpCode(HttpStatus.OK)
  suspend(
    @Param('organizationId') organizationId: string,
    @Param('workspaceId') workspaceId: string,
  ): Promise<WorkspaceResponse> {
    return this.run('suspend', organizationId, workspaceId);
  }

  @Post(':workspaceId/resume')
  @HttpCode(HttpStatus.OK)
  resume(
    @Param('organizationId') organizationId: string,
    @Param('workspaceId') workspaceId: string,
  ): Promise<WorkspaceResponse> {
    return this.run('resume', organizationId, workspaceId);
  }

  /** Starts teardown; the provisioner completes it with markDestroyed. */
  @Post(':workspaceId/destroy')
  @HttpCode(HttpStatus.OK)
  destroy(
    @Param('organizationId') organizationId: string,
    @Param('workspaceId') workspaceId: string,
  ): Promise<WorkspaceResponse> {
    return this.run('destroy', organizationId, workspaceId);
  }

  private async run(
    action: UserAction,
    organizationId: string,
    workspaceId: string,
  ): Promise<WorkspaceResponse> {
    const workspace: Workspace = await this.workspaceService[action](
      organizationId as OrganizationId,
      workspaceId as WorkspaceId,
    );

    return WorkspaceResponse.fromDomain(workspace);
  }
}
