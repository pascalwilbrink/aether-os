import {
  Body,
  Controller,
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
  CommentRequest,
  DecisionRequest,
  DiffQuery,
  PageQuery,
  ResourceParams,
  ReviewPage,
  VersionCreateRequest,
  VersionDiff,
  VersionPage,
  VersionParams,
  VersionResponse,
  VersionUpdateRequest,
} from './dto/knowledge.dto.js';
import { KnowledgeReviewsService } from './knowledge-reviews.service.js';
import { KnowledgeVersionsService } from './knowledge-versions.service.js';

/** A resource's versions, their review and their publication. */
@Controller(
  'organizations/:organizationId/knowledge/resources/:resourceId/versions',
)
export class KnowledgeVersionsController {
  constructor(
    private readonly versions: KnowledgeVersionsService,
    private readonly reviews: KnowledgeReviewsService,
  ) {}

  @Get()
  @RequirePermission('org:knowledge:read')
  @ZodSerializerDto(VersionPage)
  list(
    @Param() { organizationId, resourceId }: ResourceParams,
    @Query() query: PageQuery,
  ) {
    return this.versions.list(organizationId, resourceId, query);
  }

  @Post()
  @RequirePermission('org:knowledge:draft')
  @ZodSerializerDto(VersionResponse)
  create(
    @Param() { organizationId, resourceId }: ResourceParams,
    @Body() body: VersionCreateRequest,
  ) {
    return this.versions.create(organizationId, resourceId, body);
  }

  @Get(':versionId')
  @RequirePermission('org:knowledge:read')
  // Seshat reads the content it indexes.
  @PlatformAccess('platform:read')
  @ZodSerializerDto(VersionResponse)
  get(@Param() { organizationId, resourceId, versionId }: VersionParams) {
    return this.versions.get(organizationId, resourceId, versionId);
  }

  @Put(':versionId')
  @RequirePermission('org:knowledge:draft')
  @ZodSerializerDto(VersionResponse)
  update(
    @Param() { organizationId, resourceId, versionId }: VersionParams,
    @Body() body: VersionUpdateRequest,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.versions.update(
      organizationId,
      resourceId,
      versionId,
      body,
      ifMatch,
    );
  }

  @Get(':versionId/diff')
  @RequirePermission('org:knowledge:read')
  @ZodSerializerDto(VersionDiff)
  diff(
    @Param() { organizationId, resourceId, versionId }: VersionParams,
    @Query() { against }: DiffQuery,
  ) {
    return this.versions.diff(organizationId, resourceId, versionId, against);
  }

  @Post(':versionId/submit')
  @RequirePermission('org:knowledge:draft')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(VersionResponse)
  submit(
    @Param() { organizationId, resourceId, versionId }: VersionParams,
    @Body() body: CommentRequest,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.reviews.submit(
      organizationId,
      resourceId,
      versionId,
      body,
      ifMatch,
    );
  }

  @Post(':versionId/withdraw')
  @RequirePermission('org:knowledge:draft')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(VersionResponse)
  withdraw(
    @Param() { organizationId, resourceId, versionId }: VersionParams,
    @Body() body: CommentRequest,
  ) {
    return this.reviews.withdraw(organizationId, resourceId, versionId, body);
  }

  @Post(':versionId/decisions')
  @RequirePermission('org:knowledge:review')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(VersionResponse)
  decide(
    @Param() { organizationId, resourceId, versionId }: VersionParams,
    @Body() body: DecisionRequest,
  ) {
    return this.reviews.decide(organizationId, resourceId, versionId, body);
  }

  @Get(':versionId/reviews')
  @RequirePermission('org:knowledge:read')
  @ZodSerializerDto(ReviewPage)
  listReviews(
    @Param() { organizationId, resourceId, versionId }: VersionParams,
    @Query() query: PageQuery,
  ) {
    return this.reviews.list(organizationId, resourceId, versionId, query);
  }

  @Post(':versionId/publish')
  @RequirePermission('org:knowledge:publish')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(VersionResponse)
  publish(
    @Param() { organizationId, resourceId, versionId }: VersionParams,
    @Body() body: CommentRequest,
  ) {
    return this.reviews.publish(organizationId, resourceId, versionId, body);
  }
}
