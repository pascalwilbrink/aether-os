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

import {
  CreateSkillRequest,
  CreateSkillVersionRequest,
  ListSkillsQuery,
  ListSkillVersionsQuery,
  SkillPage,
  SkillParams,
  SkillResponse,
  SkillsParams,
  SkillVersionPage,
  SkillVersionParams,
  SkillVersionResponse,
} from './dto/skill.dto.js';
import { SkillsService } from './skills.service.js';

/** The organization's skills and their versions. */
@Controller('organizations/:organizationId/skills')
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get()
  @RequirePermission('agent:read')
  @ZodSerializerDto(SkillPage)
  list(
    @Param() { organizationId }: SkillsParams,
    @Query() query: ListSkillsQuery,
  ) {
    return this.skills.list(organizationId, query);
  }

  @Post()
  @RequirePermission('agent:write')
  @ZodSerializerDto(SkillResponse)
  create(
    @Param() { organizationId }: SkillsParams,
    @Body() body: CreateSkillRequest,
  ) {
    return this.skills.create(organizationId, body);
  }

  @Get(':skillId')
  @RequirePermission('agent:read')
  @ZodSerializerDto(SkillResponse)
  get(@Param() { organizationId, skillId }: SkillParams) {
    return this.skills.get(organizationId, skillId);
  }

  @Post(':skillId/archive')
  @RequirePermission('agent:write')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(SkillResponse)
  archive(@Param() { organizationId, skillId }: SkillParams) {
    return this.skills.archive(organizationId, skillId);
  }

  @Get(':skillId/versions')
  @RequirePermission('agent:read')
  @ZodSerializerDto(SkillVersionPage)
  listVersions(
    @Param() { organizationId, skillId }: SkillParams,
    @Query() query: ListSkillVersionsQuery,
  ) {
    return this.skills.listVersions(organizationId, skillId, query);
  }

  @Post(':skillId/versions')
  @RequirePermission('agent:write')
  @ZodSerializerDto(SkillVersionResponse)
  createVersion(
    @Param() { organizationId, skillId }: SkillParams,
    @Body() body: CreateSkillVersionRequest,
  ) {
    return this.skills.createVersion(organizationId, skillId, body);
  }

  @Get(':skillId/versions/:version')
  @RequirePermission('agent:read')
  @ZodSerializerDto(SkillVersionResponse)
  getVersion(
    @Param() { organizationId, skillId, version }: SkillVersionParams,
  ) {
    return this.skills.getVersion(organizationId, skillId, version);
  }
}
