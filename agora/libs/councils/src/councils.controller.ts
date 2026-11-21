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

import { RequirePermission, ZodSerializerDto } from '@agora/core';

import { CouncilVersionsService } from './council-versions.service.js';
import { CouncilsService } from './councils.service.js';
import {
  CouncilPage,
  CouncilParams,
  CouncilResponse,
  CouncilsParams,
  CouncilVersionPage,
  CouncilVersionParams,
  CouncilVersionResponse,
  CreateCouncilRequest,
  CreateCouncilVersionRequest,
  ListCouncilsQuery,
  ListCouncilVersionsQuery,
} from './dto/councils.dto.js';

/** Councils and their versions (../../../../docs/councils.md). */
@Controller('organizations/:organizationId/councils')
export class CouncilsController {
  constructor(
    private readonly councils: CouncilsService,
    private readonly versions: CouncilVersionsService,
  ) {}

  @Post()
  @RequirePermission('council:write')
  @ZodSerializerDto(CouncilResponse)
  create(
    @Param() { organizationId }: CouncilsParams,
    @Body() body: CreateCouncilRequest,
  ) {
    return this.councils.create(organizationId, body);
  }

  @Get()
  @RequirePermission('council:read')
  @ZodSerializerDto(CouncilPage)
  list(
    @Param() { organizationId }: CouncilsParams,
    @Query() query: ListCouncilsQuery,
  ) {
    return this.councils.list(organizationId, query);
  }

  @Get(':councilId')
  @RequirePermission('council:read')
  @ZodSerializerDto(CouncilResponse)
  findById(@Param() { organizationId, councilId }: CouncilParams) {
    return this.councils.findById(organizationId, councilId);
  }

  @Post(':councilId/archive')
  @RequirePermission('council:write')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(CouncilResponse)
  archive(@Param() { organizationId, councilId }: CouncilParams) {
    return this.councils.archive(organizationId, councilId);
  }

  @Post(':councilId/versions')
  @RequirePermission('council:write')
  @ZodSerializerDto(CouncilVersionResponse)
  createVersion(
    @Param() { organizationId, councilId }: CouncilParams,
    @Body() body: CreateCouncilVersionRequest,
  ) {
    return this.versions.create(organizationId, councilId, body);
  }

  @Get(':councilId/versions')
  @RequirePermission('council:read')
  @ZodSerializerDto(CouncilVersionPage)
  listVersions(
    @Param() { organizationId, councilId }: CouncilParams,
    @Query() query: ListCouncilVersionsQuery,
  ) {
    return this.versions.list(organizationId, councilId, query);
  }

  @Get(':councilId/versions/:versionId')
  @RequirePermission('council:read')
  @ZodSerializerDto(CouncilVersionResponse)
  findVersion(
    @Param() { organizationId, councilId, versionId }: CouncilVersionParams,
  ) {
    return this.versions.findById(organizationId, councilId, versionId);
  }

  @Post(':councilId/versions/:versionId/publish')
  @RequirePermission('council:publish')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(CouncilVersionResponse)
  publish(
    @Param() { organizationId, councilId, versionId }: CouncilVersionParams,
  ) {
    return this.versions.publish(organizationId, councilId, versionId);
  }
}
