import { Controller, Get, Param, Query } from '@nestjs/common';

import {
  RequirePermission,
  zArtifactResponse,
  ZodSerializerDto,
} from '@hephaestus/core';

import { ArtifactsService } from './artifacts.service.js';
import { ArtifactPage } from './dto/artifact-page.response.js';
import { ArtifactParams } from './dto/artifact.params.js';
import { ArtifactsParams } from './dto/artifacts.params.js';
import { ListArtifactsQuery } from './dto/list-artifacts.query.js';

const IN_PROJECT = { project: 'projectId' };

@Controller(
  'organizations/:organizationId/projects/:projectId/tasks/:taskId/artifacts',
)
export class ArtifactsController {
  constructor(private readonly artifacts: ArtifactsService) {}

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
}
