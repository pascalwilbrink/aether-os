import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ArtifactResponse } from './dto/artifact.response.js';
import {
  ArtifactEntity,
  type JsonContent,
  type TextContent,
  type VerificationContent,
} from './artifact.entity.js';
import type {
  ArtifactSource,
  NewArtifact,
  NewVerification,
} from './artifacts.service.js';

@Injectable()
export class ArtifactMapper {
  /** A new `pending` artifact; its ID (UUIDv7) is generated here. */
  toEntity(
    source: ArtifactSource,
    input: NewArtifact | NewVerification,
    now: Date,
  ): ArtifactEntity {
    return Object.assign(new ArtifactEntity(), {
      id: uuidv7(),
      ...source,
      kind: input.kind,
      status: 'pending',
      primary: input.primary ?? false,
      revisionOf:
        input.kind === 'verification' ? null : (input.revisionOf ?? null),
      title: input.title,
      metadata: input.metadata ?? {},
      review: null,
      body: bodyOf(input),
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
      review: entity.review,
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
    if (entity.kind === 'verification') {
      const body = entity.body as VerificationContent;
      return {
        ...base,
        kind: 'verification',
        round: body.round,
        results: body.results,
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

function bodyOf(
  input: NewArtifact | NewVerification,
): TextContent | JsonContent | VerificationContent {
  switch (input.kind) {
    case 'text':
      return { format: input.format, content: input.content };
    case 'json':
      return { schema: input.schema ?? null, content: input.content };
    default:
      return { round: input.round, results: input.results };
  }
}
