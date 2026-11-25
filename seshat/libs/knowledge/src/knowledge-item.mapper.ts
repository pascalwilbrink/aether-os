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
      departmentId: entity.departmentId,
      type: entity.type,
      title: entity.title,
      body: entity.body,
      rationale: entity.rationale,
      alternatives: entity.alternatives,
      status: entity.status,
      version: entity.version,
      tags: entity.tags,
      references: entity.references,
      source: {
        kind: entity.sourceKind,
        taskId: entity.sourceTaskId,
        sessionId: entity.sourceSessionId,
        agentId: entity.sourceAgentId,
        repository: this.repositoryFileOf(entity),
      },
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
      rationale: entity.rationale,
      alternatives: entity.alternatives,
      tags: entity.tags,
      references: entity.references,
      document: this.fileOf(entity),
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
      rationale: entity.rationale,
      alternatives: entity.alternatives,
      tags: entity.tags,
      references: entity.references,
      document: entity.document && {
        ...entity.document,
        repository: entity.document.repository ?? null,
      },
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  private documentOf(
    entity: KnowledgeItemEntity,
  ): ApiTypes.KnowledgeDocument | null {
    const file = this.fileOf(entity);
    if (!file || !entity.indexingStatus) {
      return null;
    }
    return {
      ...file,
      indexing: {
        status: entity.indexingStatus,
        chunkCount: entity.chunkCount,
        error: entity.indexingError,
        indexedAt: entity.indexedAt?.toISOString() ?? null,
      },
    };
  }

  /** A document's file: in Loculus, or in a linked repository. */
  private fileOf(
    entity: KnowledgeItemEntity,
  ): ApiTypes.KnowledgeDocumentFile | null {
    const repository = this.repositoryFileOf(entity);
    if (
      entity.type !== 'document' ||
      !entity.fileName ||
      !entity.contentType ||
      entity.sizeBytes === null ||
      (!repository && (!entity.fileId || !entity.sha256))
    ) {
      return null;
    }
    return {
      fileId: entity.fileId,
      fileName: entity.fileName,
      contentType: entity.contentType,
      sizeBytes: entity.sizeBytes,
      sha256: entity.sha256,
      repository,
    };
  }

  private repositoryFileOf(
    entity: KnowledgeItemEntity,
  ): ApiTypes.KnowledgeRepositoryFile | null {
    return entity.repositoryLinkId &&
      entity.repositoryFullName &&
      entity.repositoryPath &&
      entity.repositoryCommit &&
      entity.repositoryBlobSha &&
      entity.repositoryUrl
      ? {
          linkId: entity.repositoryLinkId,
          fullName: entity.repositoryFullName,
          path: entity.repositoryPath,
          commit: entity.repositoryCommit,
          blobSha: entity.repositoryBlobSha,
          url: entity.repositoryUrl,
        }
      : null;
  }
}
