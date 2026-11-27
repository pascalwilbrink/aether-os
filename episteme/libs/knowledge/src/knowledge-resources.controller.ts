import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
} from '@episteme/core';

import {
  AuditPage,
  ListResourcesQuery,
  OrganizationParams,
  PageQuery,
  ReasonRequest,
  ResourceCreateRequest,
  ResourcePage,
  ResourceParams,
  ResourceResponse,
  ResourceUpdateRequest,
  ScopesRequest,
  StewardsRequest,
} from './dto/knowledge.dto.js';
import { KnowledgeResourcesService } from './knowledge-resources.service.js';

/**
 * Knowledge resources, their scopes, stewards and audit. The route checks
 * the organization (`org:read`); what the caller may do with a resource
 * follows its owner, which `KnowledgeAccess` checks.
 */
@Controller('organizations/:organizationId/knowledge/resources')
export class KnowledgeResourcesController {
  constructor(private readonly resources: KnowledgeResourcesService) {}

  @Get()
  @RequirePermission('org:read')
  @ZodSerializerDto(ResourcePage)
  list(
    @Param() { organizationId }: OrganizationParams,
    @Query() query: ListResourcesQuery,
  ) {
    return this.resources.list(organizationId, query);
  }

  @Post()
  @RequirePermission('org:read')
  @ZodSerializerDto(ResourceResponse)
  create(
    @Param() { organizationId }: OrganizationParams,
    @Body() body: ResourceCreateRequest,
  ) {
    return this.resources.create(organizationId, body);
  }

  @Get(':resourceId')
  @RequirePermission('org:read')
  // Seshat reads what it indexes.
  @PlatformAccess('platform:read')
  @ZodSerializerDto(ResourceResponse)
  get(@Param() { organizationId, resourceId }: ResourceParams) {
    return this.resources.get(organizationId, resourceId);
  }

  @Put(':resourceId')
  @RequirePermission('org:read')
  @ZodSerializerDto(ResourceResponse)
  update(
    @Param() { organizationId, resourceId }: ResourceParams,
    @Body() body: ResourceUpdateRequest,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.resources.update(organizationId, resourceId, body, ifMatch);
  }

  @Delete(':resourceId')
  @RequirePermission('org:read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param() { organizationId, resourceId }: ResourceParams,
    @Headers('if-match') ifMatch?: string,
  ): Promise<void> {
    await this.resources.remove(organizationId, resourceId, ifMatch);
  }

  @Post(':resourceId/archive')
  @RequirePermission('org:read')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(ResourceResponse)
  archive(
    @Param() { organizationId, resourceId }: ResourceParams,
    @Body() body: ReasonRequest,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.resources.archive(organizationId, resourceId, body, ifMatch);
  }

  @Put(':resourceId/scopes')
  @RequirePermission('org:read')
  @ZodSerializerDto(ResourceResponse)
  setScopes(
    @Param() { organizationId, resourceId }: ResourceParams,
    @Body() body: ScopesRequest,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.resources.setScopes(organizationId, resourceId, body, ifMatch);
  }

  @Put(':resourceId/stewards')
  @RequirePermission('org:read')
  @ZodSerializerDto(ResourceResponse)
  setStewards(
    @Param() { organizationId, resourceId }: ResourceParams,
    @Body() body: StewardsRequest,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.resources.setStewards(
      organizationId,
      resourceId,
      body,
      ifMatch,
    );
  }

  @Get(':resourceId/audit')
  @RequirePermission('org:read')
  @ZodSerializerDto(AuditPage)
  audit(
    @Param() { organizationId, resourceId }: ResourceParams,
    @Query() query: PageQuery,
  ) {
    return this.resources.auditPage(organizationId, resourceId, query);
  }
}
