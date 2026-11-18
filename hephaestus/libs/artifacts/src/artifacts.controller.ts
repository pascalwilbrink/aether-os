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

import {
  RequirePermission,
  zArtifactResponse,
  ZodSerializerDto,
} from '@hephaestus/core';

import { ArtifactsService } from './artifacts.service.js';
import { RequestChangesRequest } from './dto/request-changes.request.js';
import { ReviewDecisionRequest } from './dto/review-decision.request.js';
import { ReviewsService } from './reviews.service.js';
import { ArtifactPage } from './dto/artifact-page.response.js';
import { ArtifactParams } from './dto/artifact.params.js';
import { ArtifactsParams } from './dto/artifacts.params.js';
import { ListArtifactsQuery } from './dto/list-artifacts.query.js';

const IN_PROJECT = { project: 'projectId' };

@Controller(
  'organizations/:organizationId/projects/:projectId/tasks/:taskId/artifacts',
)
export class ArtifactsController {
  constructor(
    private readonly artifacts: ArtifactsService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get()
  @RequirePermission('task:read', IN_PROJECT)
  @ZodSerializerDto(ArtifactPage)
  list(
    @Param() { organizationId, projectId, taskId }: ArtifactsParams,
    @Query() query: ListArtifactsQuery,
  ) {
    return this.artifacts.list(organizationId, projectId, taskId, query);
  }

  @Get(':artifactId')
  @RequirePermission('task:read', IN_PROJECT)
  @ZodSerializerDto(zArtifactResponse)
  findById(
    @Param() { organizationId, projectId, taskId, artifactId }: ArtifactParams,
  ) {
    return this.artifacts.findById(
      organizationId,
      projectId,
      taskId,
      artifactId,
    );
  }

  @Post(':artifactId/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('task:approve', IN_PROJECT)
  @ZodSerializerDto(zArtifactResponse)
  approve(
    @Param() { organizationId, projectId, taskId, artifactId }: ArtifactParams,
    @Body() body: ReviewDecisionRequest,
  ) {
    return this.reviews.decide(
      organizationId,
      projectId,
      taskId,
      artifactId,
      'approved',
      body.comment ? [{ body: body.comment }] : [],
    );
  }

  @Post(':artifactId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('task:approve', IN_PROJECT)
  @ZodSerializerDto(zArtifactResponse)
  reject(
    @Param() { organizationId, projectId, taskId, artifactId }: ArtifactParams,
    @Body() body: ReviewDecisionRequest,
  ) {
    return this.reviews.decide(
      organizationId,
      projectId,
      taskId,
      artifactId,
      'rejected',
      body.comment ? [{ body: body.comment }] : [],
    );
  }

  @Post(':artifactId/request-changes')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('task:approve', IN_PROJECT)
  @ZodSerializerDto(zArtifactResponse)
  requestChanges(
    @Param() { organizationId, projectId, taskId, artifactId }: ArtifactParams,
    @Body() body: RequestChangesRequest,
  ) {
    return this.reviews.decide(
      organizationId,
      projectId,
      taskId,
      artifactId,
      'changes_requested',
      body.comments,
    );
  }
}
