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

import {
  CreateKnowledgeItemRequest,
  DepartmentItemParams,
  DepartmentParams,
  KnowledgeItemPage,
  KnowledgeItemResponse,
  KnowledgeItemVersionPage,
  KnowledgeSearchResponse,
  ListDepartmentKnowledgeItemsQuery,
  ListKnowledgeItemVersionsQuery,
  SearchKnowledgeRequest,
  UpdateKnowledgeItemRequest,
} from './dto/knowledge.dto.js';
import { KnowledgeItemsService } from './knowledge-items.service.js';
import { KnowledgeSearchService } from './knowledge-search.service.js';

/**
 * A department's knowledge: items every project in the department reads.
 * Organization owners and admins write and accept them
 * (`org:knowledge:write`); every member reads them (`org:read`).
 */
@Controller('organizations/:organizationId/departments/:departmentId/knowledge')
export class DepartmentKnowledgeController {
  constructor(
    private readonly items: KnowledgeItemsService,
    private readonly searches: KnowledgeSearchService,
  ) {}

  @Post('items')
  @RequirePermission('org:knowledge:write')
  @ZodSerializerDto(KnowledgeItemResponse)
  create(
    @Param() { organizationId, departmentId }: DepartmentParams,
    @Body() body: CreateKnowledgeItemRequest,
  ) {
    return this.items.create(
      this.items.departmentScope(organizationId, departmentId),
      body,
    );
  }

  @Get('items')
  @RequirePermission('org:read')
  @ZodSerializerDto(KnowledgeItemPage)
  list(
    @Param() { organizationId, departmentId }: DepartmentParams,
    @Query() { type, status, ...page }: ListDepartmentKnowledgeItemsQuery,
  ) {
    return this.items.list(
      this.items.departmentScope(organizationId, departmentId),
      { type, status },
      page,
    );
  }

  @Get('items/:itemId')
  @RequirePermission('org:read')
  @PlatformAccess('platform:read')
  @ZodSerializerDto(KnowledgeItemResponse)
  findById(
    @Param() { organizationId, departmentId, itemId }: DepartmentItemParams,
  ) {
    return this.items.findById(
      this.items.departmentScope(organizationId, departmentId),
      itemId,
    );
  }

  @Put('items/:itemId')
  @RequirePermission('org:knowledge:write')
  @ZodSerializerDto(KnowledgeItemResponse)
  update(
    @Param() { organizationId, departmentId, itemId }: DepartmentItemParams,
    @Body() body: UpdateKnowledgeItemRequest,
  ) {
    return this.items.update(
      this.items.departmentScope(organizationId, departmentId),
      itemId,
      body,
    );
  }

  @Get('items/:itemId/versions')
  @RequirePermission('org:read')
  @ZodSerializerDto(KnowledgeItemVersionPage)
  versions(
    @Param() { organizationId, departmentId, itemId }: DepartmentItemParams,
    @Query() page: ListKnowledgeItemVersionsQuery,
  ) {
    return this.items.versionsOf(
      this.items.departmentScope(organizationId, departmentId),
      itemId,
      page,
    );
  }

  @Post('items/:itemId/accept')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('org:knowledge:write')
  @ZodSerializerDto(KnowledgeItemResponse)
  accept(
    @Param() { organizationId, departmentId, itemId }: DepartmentItemParams,
  ) {
    return this.items.accept(
      this.items.departmentScope(organizationId, departmentId),
      itemId,
    );
  }

  @Post('items/:itemId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('org:knowledge:write')
  @ZodSerializerDto(KnowledgeItemResponse)
  reject(
    @Param() { organizationId, departmentId, itemId }: DepartmentItemParams,
  ) {
    return this.items.reject(
      this.items.departmentScope(organizationId, departmentId),
      itemId,
    );
  }

  @Post('items/:itemId/retire')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('org:knowledge:write')
  @ZodSerializerDto(KnowledgeItemResponse)
  retire(
    @Param() { organizationId, departmentId, itemId }: DepartmentItemParams,
  ) {
    return this.items.retire(
      this.items.departmentScope(organizationId, departmentId),
      itemId,
    );
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('org:read')
  @ZodSerializerDto(KnowledgeSearchResponse)
  search(
    @Param() { organizationId, departmentId }: DepartmentParams,
    @Body() body: SearchKnowledgeRequest,
  ) {
    return this.searches.search(
      this.items.departmentScope(organizationId, departmentId),
      body,
    );
  }
}
