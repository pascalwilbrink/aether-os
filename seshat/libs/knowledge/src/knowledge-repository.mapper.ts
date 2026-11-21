import { Injectable } from '@nestjs/common';

import type { ApiTypes } from '@seshat/core';

import type { KnowledgeRepositoryEntity } from './knowledge-repository.entity.js';

@Injectable()
export class KnowledgeRepositoryMapper {
  toResponse(
    entity: KnowledgeRepositoryEntity,
  ): ApiTypes.KnowledgeRepositoryResponse {
    return {
      linkId: entity.linkId,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      fullName: entity.fullName,
      paths: entity.paths,
      status: entity.status,
      commit: entity.commit,
      documentCount: entity.documentCount,
      skippedCount: entity.skippedCount,
      error: entity.error,
      syncedAt: entity.syncedAt?.toISOString() ?? null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
