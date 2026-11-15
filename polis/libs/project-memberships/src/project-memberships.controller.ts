import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import {
  Authenticated,
  PlatformAccess,
  RequirePermission,
  ZodSerializerDto,
} from '@polis/core';

import { CreateProjectMembershipRequest } from './dto/create-project-membership.request.js';
import { ListProjectMembershipsOfSubjectQuery } from './dto/list-project-memberships-of-subject.query.js';
import { ListProjectMembershipsQuery } from './dto/list-project-memberships.query.js';
import { ProjectMembershipPage } from './dto/project-membership-page.response.js';
import { ProjectMembershipParams } from './dto/project-membership.params.js';
import { ProjectMembershipResponse } from './dto/project-membership.response.js';
import { ProjectMembershipsParams } from './dto/project-memberships.params.js';
import { UpdateProjectMembershipRequest } from './dto/update-project-membership.request.js';
import { ProjectMembershipsService } from './project-memberships.service.js';

const IN_PROJECT = { project: 'projectId' };

@Controller('organizations/:organizationId/projects/:projectId/memberships')
export class ProjectMembershipsController {
  constructor(private readonly grants: ProjectMembershipsService) {}

  @Post()
  @RequirePermission('project-member:manage', IN_PROJECT)
  @ZodSerializerDto(ProjectMembershipResponse)
  create(
    @Param() { organizationId, projectId }: ProjectMembershipsParams,
    @Body() body: CreateProjectMembershipRequest,
  ) {
    return this.grants.create(organizationId, projectId, body);
  }

  @Get()
  @RequirePermission('project:read', IN_PROJECT)
  @ZodSerializerDto(ProjectMembershipPage)
  list(
    @Param() { organizationId, projectId }: ProjectMembershipsParams,
    @Query() query: ListProjectMembershipsQuery,
  ) {
    return this.grants.list(organizationId, projectId, query);
  }

  @Get(':membershipId')
  @RequirePermission('project:read', IN_PROJECT)
  @ZodSerializerDto(ProjectMembershipResponse)
  findById(
    @Param()
    { organizationId, projectId, membershipId }: ProjectMembershipParams,
  ) {
    return this.grants.findById(organizationId, projectId, membershipId);
  }

  @Put(':membershipId')
  @RequirePermission('project-member:manage', IN_PROJECT)
  @ZodSerializerDto(ProjectMembershipResponse)
  update(
    @Param()
    { organizationId, projectId, membershipId }: ProjectMembershipParams,
    @Body() body: UpdateProjectMembershipRequest,
  ) {
    return this.grants.update(organizationId, projectId, membershipId, body);
  }

  @Delete(':membershipId')
  @RequirePermission('project-member:manage', IN_PROJECT)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param()
    { organizationId, projectId, membershipId }: ProjectMembershipParams,
  ) {
    return this.grants.delete(organizationId, projectId, membershipId);
  }
}

/** A principal's project roles in one organization (for Pistis's tokens). */
@Controller('project-memberships')
export class SubjectProjectMembershipsController {
  constructor(private readonly grants: ProjectMembershipsService) {}

  @Get()
  @Authenticated()
  @PlatformAccess('platform:read')
  @ZodSerializerDto(ProjectMembershipPage)
  list(
    @Query()
    {
      organizationId,
      subjectType,
      subject,
      ...page
    }: ListProjectMembershipsOfSubjectQuery,
  ) {
    return this.grants.listOfSubject(
      organizationId,
      subjectType,
      subject,
      page,
    );
  }
}
