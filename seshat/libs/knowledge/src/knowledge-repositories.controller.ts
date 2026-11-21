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

import { RequirePermission, ZodSerializerDto } from '@seshat/core';

import {
  KnowledgeRepositoryPage,
  KnowledgeRepositoryResponse,
  ListKnowledgeRepositoriesQuery,
  ProjectParams,
  PutKnowledgeRepositoryRequest,
  RepositoryParams,
} from './dto/knowledge.dto.js';
import { KnowledgeRepositoriesService } from './knowledge-repositories.service.js';

const IN_PROJECT = { project: 'projectId' };

/** Repositories whose documents the project's knowledge indexes. */
@Controller(
  'organizations/:organizationId/projects/:projectId/knowledge/repositories',
)
export class KnowledgeRepositoriesController {
  constructor(private readonly repositories: KnowledgeRepositoriesService) {}

  @Get()
  @RequirePermission('knowledge:read', IN_PROJECT)
  @ZodSerializerDto(KnowledgeRepositoryPage)
  list(
    @Param() { organizationId, projectId }: ProjectParams,
    @Query() page: ListKnowledgeRepositoriesQuery,
  ) {
    return this.repositories.list(organizationId, projectId, page);
  }

  @Get(':linkId')
  @RequirePermission('knowledge:read', IN_PROJECT)
  @ZodSerializerDto(KnowledgeRepositoryResponse)
  findById(@Param() { organizationId, projectId, linkId }: RepositoryParams) {
    return this.repositories.findById(organizationId, projectId, linkId);
  }

  @Put(':linkId')
  @RequirePermission('knowledge:approve', IN_PROJECT)
  @ZodSerializerDto(KnowledgeRepositoryResponse)
  put(
    @Param() { organizationId, projectId, linkId }: RepositoryParams,
    @Body() body: PutKnowledgeRepositoryRequest,
  ) {
    return this.repositories.put(organizationId, projectId, linkId, body);
  }

  @Delete(':linkId')
  @RequirePermission('knowledge:approve', IN_PROJECT)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() { organizationId, projectId, linkId }: RepositoryParams) {
    return this.repositories.remove(organizationId, projectId, linkId);
  }

  @Post(':linkId/sync')
  @RequirePermission('knowledge:approve', IN_PROJECT)
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(KnowledgeRepositoryResponse)
  sync(@Param() { organizationId, projectId, linkId }: RepositoryParams) {
    return this.repositories.sync(organizationId, projectId, linkId);
  }
}
