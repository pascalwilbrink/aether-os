import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ArtifactResponse } from './dto/artifact.response.js';
import {
  ArtifactEntity,
  type JsonContent,
  type TextContent,
} from './artifact.entity.js';
import type { ArtifactSource, NewArtifact } from './artifacts.service.js';

@Injectable()
export class ArtifactMapper {
  /** A new `pending` artifact; its ID (UUIDv7) is generated here. */
  toEntity(
    source: ArtifactSource,
    input: NewArtifact,
    now: Date,
  ): ArtifactEntity {
    return Object.assign(new ArtifactEntity(), {
      id: uuidv7(),
      ...source,
      kind: input.kind,
      status: 'pending',
      primary: input.primary ?? false,
      revisionOf: null,
      title: input.title,
      metadata: input.metadata ?? {},
      body:
        input.kind === 'text'
          ? ({
              format: input.format,
              content: input.content,
            } satisfies TextContent)
          : ({
              schema: input.schema ?? null,
              content: input.content,
            } satisfies JsonContent),
      createdAt: now,
      updatedAt: now,
      version: 1,
    } satisfies ArtifactEntity);
  }

  toResponse(entity: ArtifactEntity): ArtifactResponse {
    const base = {
      id: entity.id,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      taskId: entity.taskId,
      executionId: entity.executionId,
      agentVersionId: entity.agentVersionId,
      status: entity.status,
      primary: entity.primary,
      revisionOf: entity.revisionOf,
      title: entity.title,
      metadata: entity.metadata,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      version: entity.version,
    };
    if (entity.kind === 'text') {
      const body = entity.body as TextContent;
      return {
        ...base,
        kind: 'text',
        format: body.format,
        content: body.content,
      };
    }
    const body = entity.body as JsonContent;
    return {
      ...base,
      kind: 'json',
      schema: body.schema,
      content: body.content,
    };
  }
}
