import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { RequirePermission, ZodSerializerDto } from '@proxenos/core';

import { CreateRepositoryTokenRequest } from './dto/create-repository-token.request.js';
import { LinkRepositoryRequest } from './dto/link-repository.request.js';
import { ListRepositoryLinksQuery } from './dto/list-repository-links.query.js';
import { ProjectRepositoriesParams } from './dto/project-repositories.params.js';
import { RepositoryLinkPage } from './dto/repository-link-page.response.js';
import { RepositoryLinkParams } from './dto/repository-link.params.js';
import { RepositoryLinkResponse } from './dto/repository-link.response.js';
import { RepositoryTokenResponse } from './dto/repository-token.response.js';
import { RepositoryLinksService } from './repository-links.service.js';
import { RepositoryTokensService } from './repository-tokens.service.js';

const IN_PROJECT = { project: 'projectId' };

@Controller('organizations/:organizationId/projects/:projectId/repositories')
export class RepositoryLinksController {
  constructor(
    private readonly links: RepositoryLinksService,
    private readonly tokens: RepositoryTokensService,
  ) {}

  @Post()
  @RequirePermission('project:manage', IN_PROJECT)
  @ZodSerializerDto(RepositoryLinkResponse)
  link(
    @Param() { organizationId, projectId }: ProjectRepositoriesParams,
    @Body() body: LinkRepositoryRequest,
  ) {
    return this.links.link(organizationId, projectId, body);
  }

  @Get()
  @RequirePermission('project:read', IN_PROJECT)
  @ZodSerializerDto(RepositoryLinkPage)
  list(
    @Param() { organizationId, projectId }: ProjectRepositoriesParams,
    @Query() query: ListRepositoryLinksQuery,
  ) {
    return this.links.list(organizationId, projectId, query);
  }

  @Get(':linkId')
  @RequirePermission('project:read', IN_PROJECT)
  @ZodSerializerDto(RepositoryLinkResponse)
  findById(
    @Param() { organizationId, projectId, linkId }: RepositoryLinkParams,
  ) {
    return this.links.findById(organizationId, projectId, linkId);
  }

  @Delete(':linkId')
  @RequirePermission('project:manage', IN_PROJECT)
  @HttpCode(HttpStatus.NO_CONTENT)
  unlink(@Param() { organizationId, projectId, linkId }: RepositoryLinkParams) {
    return this.links.unlink(organizationId, projectId, linkId);
  }

  @Post(':linkId/tokens')
  @RequirePermission('repository:token', IN_PROJECT)
  @ZodSerializerDto(RepositoryTokenResponse)
  token(
    @Param() { organizationId, projectId, linkId }: RepositoryLinkParams,
    @Body() body: CreateRepositoryTokenRequest,
  ) {
    return this.tokens.create(organizationId, projectId, linkId, body);
  }
}
