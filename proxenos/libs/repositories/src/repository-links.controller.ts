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
  StreamableFile,
} from '@nestjs/common';

import {
  PlatformAccess,
  RequirePermission,
  ZodSerializerDto,
} from '@proxenos/core';

import { CreateRepositoryTokenRequest } from './dto/create-repository-token.request.js';
import { LinkRepositoryRequest } from './dto/link-repository.request.js';
import { ListRepositoryFilesQuery } from './dto/list-repository-files.query.js';
import { ListRepositoryLinksQuery } from './dto/list-repository-links.query.js';
import { ProjectRepositoriesParams } from './dto/project-repositories.params.js';
import { RepositoryBlobParams } from './dto/repository-blob.params.js';
import { RepositoryFilesResponse } from './dto/repository-files.response.js';
import { RepositoryLinkPage } from './dto/repository-link-page.response.js';
import { RepositoryLinkParams } from './dto/repository-link.params.js';
import { RepositoryLinkResponse } from './dto/repository-link.response.js';
import { RepositoryTokenResponse } from './dto/repository-token.response.js';
import { RepositoryFilesService } from './repository-files.service.js';
import { RepositoryLinksService } from './repository-links.service.js';
import { RepositoryTokensService } from './repository-tokens.service.js';

const IN_PROJECT = { project: 'projectId' };

@Controller('organizations/:organizationId/projects/:projectId/repositories')
export class RepositoryLinksController {
  constructor(
    private readonly links: RepositoryLinksService,
    private readonly tokens: RepositoryTokensService,
    private readonly files: RepositoryFilesService,
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

  /** Its files at the default branch's head (Seshat's repository documents). */
  @Get(':linkId/files')
  @RequirePermission('project:read', IN_PROJECT)
  @PlatformAccess('platform:read')
  @ZodSerializerDto(RepositoryFilesResponse)
  listFiles(
    @Param() { organizationId, projectId, linkId }: RepositoryLinkParams,
    @Query() query: ListRepositoryFilesQuery,
  ) {
    return this.files.list(organizationId, projectId, linkId, query.path);
  }

  @Get(':linkId/blobs/:sha')
  @RequirePermission('project:read', IN_PROJECT)
  @PlatformAccess('platform:read')
  async blob(
    @Param() { organizationId, projectId, linkId, sha }: RepositoryBlobParams,
  ): Promise<StreamableFile> {
    const bytes = await this.files.blob(organizationId, projectId, linkId, sha);
    return new StreamableFile(bytes, {
      type: 'application/octet-stream',
      length: bytes.byteLength,
    });
  }
}
