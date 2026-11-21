import {
  Body,
  Controller,
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
} from '@seshat/core';

import { DocumentsService } from './documents.service.js';
import {
  CreateKnowledgeDocumentRequest,
  CreateKnowledgeItemRequest,
  ItemParams,
  KnowledgeItemPage,
  KnowledgeItemResponse,
  KnowledgeItemVersionPage,
  KnowledgeSearchResponse,
  ListKnowledgeItemsQuery,
  ListKnowledgeItemVersionsQuery,
  ListKnowledgeItemPassagesQuery,
  KnowledgePassagePage,
  ProjectParams,
  SearchKnowledgeRequest,
  UpdateKnowledgeDocumentRequest,
  UpdateKnowledgeItemRequest,
} from './dto/knowledge.dto.js';
import { KnowledgeItemsService } from './knowledge-items.service.js';
import { KnowledgeSearchService } from './knowledge-search.service.js';

const IN_PROJECT = { project: 'projectId' };

/** A project's knowledge (../../../../docs/knowledge.md). */
@Controller('organizations/:organizationId/projects/:projectId/knowledge')
export class KnowledgeController {
  constructor(
    private readonly items: KnowledgeItemsService,
    private readonly documents: DocumentsService,
    private readonly searches: KnowledgeSearchService,
  ) {}

  @Post('items')
  @RequirePermission('knowledge:write', IN_PROJECT)
  @ZodSerializerDto(KnowledgeItemResponse)
  create(
    @Param() { organizationId, projectId }: ProjectParams,
    @Body() body: CreateKnowledgeItemRequest,
  ) {
    return this.items.create(organizationId, projectId, body);
  }

  @Get('items')
  @RequirePermission('knowledge:read', IN_PROJECT)
  @ZodSerializerDto(KnowledgeItemPage)
  list(
    @Param() { organizationId, projectId }: ProjectParams,
    @Query() { type, status, ...page }: ListKnowledgeItemsQuery,
  ) {
    return this.items.list(organizationId, projectId, { type, status }, page);
  }

  @Get('items/:itemId')
  @RequirePermission('knowledge:read', IN_PROJECT)
  // Platform services read items too (Hephaestus pins them on tasks).
  @PlatformAccess('platform:read')
  @ZodSerializerDto(KnowledgeItemResponse)
  findById(@Param() { organizationId, projectId, itemId }: ItemParams) {
    return this.items.findById(organizationId, projectId, itemId);
  }

  @Put('items/:itemId')
  @RequirePermission('knowledge:write', IN_PROJECT)
  @ZodSerializerDto(KnowledgeItemResponse)
  update(
    @Param() { organizationId, projectId, itemId }: ItemParams,
    @Body() body: UpdateKnowledgeItemRequest,
  ) {
    return this.items.update(organizationId, projectId, itemId, body);
  }

  @Get('items/:itemId/versions')
  @RequirePermission('knowledge:read', IN_PROJECT)
  @ZodSerializerDto(KnowledgeItemVersionPage)
  versions(
    @Param() { organizationId, projectId, itemId }: ItemParams,
    @Query() page: ListKnowledgeItemVersionsQuery,
  ) {
    return this.items.versionsOf(organizationId, projectId, itemId, page);
  }

  @Get('items/:itemId/passages')
  @RequirePermission('knowledge:read', IN_PROJECT)
  @ZodSerializerDto(KnowledgePassagePage)
  passages(
    @Param() { organizationId, projectId, itemId }: ItemParams,
    @Query() page: ListKnowledgeItemPassagesQuery,
  ) {
    return this.items.passagesOf(organizationId, projectId, itemId, page);
  }

  @Post('items/:itemId/accept')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('knowledge:approve', IN_PROJECT)
  @ZodSerializerDto(KnowledgeItemResponse)
  accept(@Param() { organizationId, projectId, itemId }: ItemParams) {
    return this.items.accept(organizationId, projectId, itemId);
  }

  @Post('items/:itemId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('knowledge:approve', IN_PROJECT)
  @ZodSerializerDto(KnowledgeItemResponse)
  reject(@Param() { organizationId, projectId, itemId }: ItemParams) {
    return this.items.reject(organizationId, projectId, itemId);
  }

  @Post('items/:itemId/retire')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('knowledge:approve', IN_PROJECT)
  @ZodSerializerDto(KnowledgeItemResponse)
  retire(@Param() { organizationId, projectId, itemId }: ItemParams) {
    return this.items.retire(organizationId, projectId, itemId);
  }

  @Post('documents')
  @RequirePermission('knowledge:write', IN_PROJECT)
  @ZodSerializerDto(KnowledgeItemResponse)
  createDocument(
    @Param() { organizationId, projectId }: ProjectParams,
    @Body() body: CreateKnowledgeDocumentRequest,
  ) {
    return this.documents.create(organizationId, projectId, body);
  }

  @Put('documents/:itemId')
  @RequirePermission('knowledge:write', IN_PROJECT)
  @ZodSerializerDto(KnowledgeItemResponse)
  updateDocument(
    @Param() { organizationId, projectId, itemId }: ItemParams,
    @Body() body: UpdateKnowledgeDocumentRequest,
  ) {
    return this.documents.update(organizationId, projectId, itemId, body);
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('knowledge:read', IN_PROJECT)
  @ZodSerializerDto(KnowledgeSearchResponse)
  search(
    @Param() { organizationId, projectId }: ProjectParams,
    @Body() body: SearchKnowledgeRequest,
  ) {
    return this.searches.search(organizationId, projectId, body);
  }
}
