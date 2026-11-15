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

import { CreateWorkspaceRequest } from './dto/create-workspace.request.js';
import { ListWorkspacesQuery } from './dto/list-workspaces.query.js';
import { WorkspacePage } from './dto/workspace-page.response.js';
import { WorkspaceParams } from './dto/workspace.params.js';
import { WorkspaceResponse } from './dto/workspace.response.js';
import { WorkspacesParams } from './dto/workspaces.params.js';
import { WorkspacesService } from './workspaces.service.js';

@Controller('organizations/:organizationId/workspaces')
// The organization's members; the project permission (workspace:read /
// workspace:manage) is checked in WorkspacesService once the project is known.
@RequirePermission('org:read')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  @ZodSerializerDto(WorkspaceResponse)
  create(
    @Param() { organizationId }: WorkspacesParams,
    @Body() body: CreateWorkspaceRequest,
  ) {
    return this.workspaces.create(organizationId, body);
  }

  @Get()
  @ZodSerializerDto(WorkspacePage)
  list(
    @Param() { organizationId }: WorkspacesParams,
    @Query() query: ListWorkspacesQuery,
  ) {
    return this.workspaces.list(organizationId, query);
  }

  @Get(':workspaceId')
  @ZodSerializerDto(WorkspaceResponse)
  findById(@Param() { organizationId, workspaceId }: WorkspaceParams) {
    return this.workspaces.findById(organizationId, workspaceId);
  }

  @Post(':workspaceId/acquire')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(WorkspaceResponse)
  acquire(@Param() { organizationId, workspaceId }: WorkspaceParams) {
    return this.workspaces.acquire(organizationId, workspaceId);
  }

  @Post(':workspaceId/release')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(WorkspaceResponse)
  release(@Param() { organizationId, workspaceId }: WorkspaceParams) {
    return this.workspaces.release(organizationId, workspaceId);
  }

  @Post(':workspaceId/suspend')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(WorkspaceResponse)
  suspend(@Param() { organizationId, workspaceId }: WorkspaceParams) {
    return this.workspaces.suspend(organizationId, workspaceId);
  }

  @Post(':workspaceId/resume')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(WorkspaceResponse)
  resume(@Param() { organizationId, workspaceId }: WorkspaceParams) {
    return this.workspaces.resume(organizationId, workspaceId);
  }

  /** Starts teardown; the provisioner completes it. */
  @Post(':workspaceId/destroy')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(WorkspaceResponse)
  destroy(@Param() { organizationId, workspaceId }: WorkspaceParams) {
    return this.workspaces.destroy(organizationId, workspaceId);
  }
}
