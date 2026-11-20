import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

import {
  AccessControl,
  PlatformAccess,
  RequirePermission,
  ZodSerializerDto,
} from '@pylon/core';

import { projectCallContext } from './call-context.js';
import {
  EmbeddingsParams,
  EmbeddingsRequest,
  EmbeddingsResponse,
} from './dto/embeddings.dto.js';
import { EmbeddingsService } from './embeddings.service.js';

/** Embeddings charged to a project (Seshat's passages, an agent's texts). */
@Controller('organizations/:organizationId/projects/:projectId/embeddings')
export class EmbeddingsController {
  constructor(
    private readonly embeddings: EmbeddingsService,
    private readonly access: AccessControl,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermission('model:invoke', { project: 'projectId' })
  @PlatformAccess('model:invoke')
  @ZodSerializerDto(EmbeddingsResponse)
  embed(
    @Param() { organizationId, projectId }: EmbeddingsParams,
    @Body() body: EmbeddingsRequest,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    return this.embeddings.embed(
      projectCallContext(
        this.access.principal(),
        organizationId,
        projectId,
        headers,
      ),
      body,
    );
  }
}
