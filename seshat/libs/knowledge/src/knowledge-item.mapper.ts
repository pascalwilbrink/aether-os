import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ApiTypes } from '@seshat/core';

import { KnowledgeItemVersionEntity } from './knowledge-item-version.entity.js';
import type { KnowledgeItemEntity } from './knowledge-item.entity.js';

@Injectable()
export class KnowledgeItemMapper {
  toResponse(entity: KnowledgeItemEntity): ApiTypes.KnowledgeItemResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      type: entity.type,
      title: entity.title,
      body: entity.body,
      status: entity.status,
      version: entity.version,
      tags: entity.tags,
      references: entity.references,
      source: { kind: entity.sourceKind, taskId: entity.sourceTaskId },
      supersedes: entity.supersedes,
      supersededBy: entity.supersededBy,
      reviewBy: entity.reviewBy,
      document: this.documentOf(entity),
      createdBy: entity.createdBy,
      updatedBy: entity.updatedBy,
      acceptedBy: entity.acceptedBy,
      acceptedAt: entity.acceptedAt?.toISOString() ?? null,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  /** The item's current version, for its history. */
  toVersionEntity(entity: KnowledgeItemEntity): KnowledgeItemVersionEntity {
    return Object.assign(new KnowledgeItemVersionEntity(), {
      id: uuidv7(),
      itemId: entity.id,
      version: entity.version,
      title: entity.title,
      body: entity.body,
      tags: entity.tags,
      references: entity.references,
      document:
        entity.fileId &&
        entity.fileName &&
        entity.contentType &&
        entity.sizeBytes !== null &&
        entity.sha256
          ? {
              fileId: entity.fileId,
              fileName: entity.fileName,
              contentType: entity.contentType,
              sizeBytes: entity.sizeBytes,
              sha256: entity.sha256,
            }
          : null,
      createdBy: entity.updatedBy,
      createdAt: entity.updatedAt,
    } satisfies KnowledgeItemVersionEntity);
  }

  toVersionResponse(
    entity: KnowledgeItemVersionEntity,
  ): ApiTypes.KnowledgeItemVersionResponse {
    return {
      itemId: entity.itemId,
      version: entity.version,
      title: entity.title,
      body: entity.body,
      tags: entity.tags,
      references: entity.references,
      document: entity.document,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  private documentOf(
    entity: KnowledgeItemEntity,
  ): ApiTypes.KnowledgeDocument | null {
    if (
      entity.type !== 'document' ||
      !entity.fileId ||
      !entity.fileName ||
      !entity.contentType ||
      entity.sizeBytes === null ||
      !entity.sha256 ||
      !entity.indexingStatus
    ) {
      return null;
    }
    return {
      fileId: entity.fileId,
      fileName: entity.fileName,
      contentType: entity.contentType,
      sizeBytes: entity.sizeBytes,
      sha256: entity.sha256,
      indexing: {
        status: entity.indexingStatus,
        chunkCount: entity.chunkCount,
        error: entity.indexingError,
        indexedAt: entity.indexedAt?.toISOString() ?? null,
      },
    };
  }
}
