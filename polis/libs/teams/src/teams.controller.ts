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
  PlatformAccess,
  RequirePermission,
  ZodSerializerDto,
} from '@polis/core';

import { AddTeamMemberRequest } from './dto/add-team-member.request.js';
import { CreateTeamRequest } from './dto/create-team.request.js';
import { ListTeamMembersQuery } from './dto/list-team-members.query.js';
import { ListTeamsQuery } from './dto/list-teams.query.js';
import { TeamMemberPage } from './dto/team-member-page.response.js';
import { TeamMemberParams } from './dto/team-member.params.js';
import { TeamMemberResponse } from './dto/team-member.response.js';
import { TeamPage } from './dto/team-page.response.js';
import { TeamParams } from './dto/team.params.js';
import { TeamResponse } from './dto/team.response.js';
import { TeamsParams } from './dto/teams.params.js';
import { UpdateTeamRequest } from './dto/update-team.request.js';
import { TeamsService } from './teams.service.js';

@Controller('organizations/:organizationId/teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Post()
  @RequirePermission('org:manage')
  @ZodSerializerDto(TeamResponse)
  create(
    @Param() { organizationId }: TeamsParams,
    @Body() body: CreateTeamRequest,
  ) {
    return this.teams.create(organizationId, body);
  }

  @Get()
  @RequirePermission('org:read')
  @PlatformAccess('platform:read')
  @ZodSerializerDto(TeamPage)
  list(
    @Param() { organizationId }: TeamsParams,
    @Query() query: ListTeamsQuery,
  ) {
    return this.teams.list(organizationId, query);
  }

  @Get(':teamId')
  @RequirePermission('org:read')
  @PlatformAccess('platform:read')
  @ZodSerializerDto(TeamResponse)
  findById(@Param() { organizationId, teamId }: TeamParams) {
    return this.teams.findById(organizationId, teamId);
  }

  @Put(':teamId')
  @RequirePermission('org:manage')
  @ZodSerializerDto(TeamResponse)
  update(
    @Param() { organizationId, teamId }: TeamParams,
    @Body() body: UpdateTeamRequest,
  ) {
    return this.teams.update(organizationId, teamId, body);
  }

  @Post(':teamId/archive')
  @RequirePermission('org:manage')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(TeamResponse)
  archive(@Param() { organizationId, teamId }: TeamParams) {
    return this.teams.archive(organizationId, teamId);
  }

  @Post(':teamId/members')
  @RequirePermission('org:manage')
  @ZodSerializerDto(TeamMemberResponse)
  addMember(
    @Param() { organizationId, teamId }: TeamParams,
    @Body() { personId }: AddTeamMemberRequest,
  ) {
    return this.teams.addMember(organizationId, teamId, personId);
  }

  @Get(':teamId/members')
  @RequirePermission('org:read')
  @PlatformAccess('platform:read')
  @ZodSerializerDto(TeamMemberPage)
  listMembers(
    @Param() { organizationId, teamId }: TeamParams,
    @Query() query: ListTeamMembersQuery,
  ) {
    return this.teams.listMembers(organizationId, teamId, query);
  }

  @Delete(':teamId/members/:personId')
  @RequirePermission('org:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param() { organizationId, teamId, personId }: TeamMemberParams,
  ) {
    return this.teams.removeMember(organizationId, teamId, personId);
  }
}
