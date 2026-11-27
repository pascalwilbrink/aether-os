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
 * Knowledge resources, their scopes, stewards and audit. Where the contract
 * says "or as one of its owners", the route asks for `org:knowledge:draft`
 * and the service checks the rest.
 */
@Controller('organizations/:organizationId/knowledge/resources')
export class KnowledgeResourcesController {
  constructor(private readonly resources: KnowledgeResourcesService) {}

  @Get()
  @RequirePermission('org:knowledge:read')
  @ZodSerializerDto(ResourcePage)
  list(
    @Param() { organizationId }: OrganizationParams,
    @Query() query: ListResourcesQuery,
  ) {
    return this.resources.list(organizationId, query);
  }

  @Post()
  @RequirePermission('org:knowledge:draft')
  @ZodSerializerDto(ResourceResponse)
  create(
    @Param() { organizationId }: OrganizationParams,
    @Body() body: ResourceCreateRequest,
  ) {
    return this.resources.create(organizationId, body);
  }

  @Get(':resourceId')
  @RequirePermission('org:knowledge:read')
  // Seshat reads what it indexes.
  @PlatformAccess('platform:read')
  @ZodSerializerDto(ResourceResponse)
  get(@Param() { organizationId, resourceId }: ResourceParams) {
    return this.resources.get(organizationId, resourceId);
  }

  @Put(':resourceId')
  @RequirePermission('org:knowledge:draft')
  @ZodSerializerDto(ResourceResponse)
  update(
    @Param() { organizationId, resourceId }: ResourceParams,
    @Body() body: ResourceUpdateRequest,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.resources.update(organizationId, resourceId, body, ifMatch);
  }

  @Delete(':resourceId')
  @RequirePermission('org:knowledge:draft')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param() { organizationId, resourceId }: ResourceParams,
    @Headers('if-match') ifMatch?: string,
  ): Promise<void> {
    await this.resources.remove(organizationId, resourceId, ifMatch);
  }

  @Post(':resourceId/archive')
  @RequirePermission('org:knowledge:draft')
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
  @RequirePermission('org:knowledge:draft')
  @ZodSerializerDto(ResourceResponse)
  setScopes(
    @Param() { organizationId, resourceId }: ResourceParams,
    @Body() body: ScopesRequest,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.resources.setScopes(organizationId, resourceId, body, ifMatch);
  }

  @Put(':resourceId/stewards')
  @RequirePermission('org:knowledge:draft')
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
  @RequirePermission('org:knowledge:read')
  @ZodSerializerDto(AuditPage)
  audit(
    @Param() { organizationId, resourceId }: ResourceParams,
    @Query() query: PageQuery,
  ) {
    return this.resources.auditPage(organizationId, resourceId, query);
  }
}
