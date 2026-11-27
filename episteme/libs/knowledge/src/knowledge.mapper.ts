import { Injectable } from '@nestjs/common';

import type {
  ApiTypes,
  KnowledgeResourceCreated,
  KnowledgeVersionCreated,
} from '@episteme/core';

import type {
  KnowledgeAuditEntity,
  KnowledgeResourceEntity,
  KnowledgeReviewEntity,
  KnowledgeVersionEntity,
} from './entities/index.js';

type KnowledgeResource = KnowledgeResourceCreated['resource'];
type KnowledgeVersion = KnowledgeVersionCreated['version'];

const iso = (date: Date | null): string | null =>
  date ? date.toISOString() : null;

/** Entities → API responses and event payloads (IDs only, no titles or content). */
@Injectable()
export class KnowledgeMapper {
  toResourceResponse(
    entity: KnowledgeResourceEntity,
    versions: ReadonlyMap<string, KnowledgeVersionEntity>,
  ): ApiTypes.KnowledgeResourceResponse {
    const summary = (id: string | null) => {
      const version = id ? versions.get(id) : undefined;
      return version ? this.toVersionSummary(version) : null;
    };
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      departmentId: entity.departmentId,
      knowledgeType: entity.knowledgeType,
      title: entity.title,
      description: entity.description,
      tags: entity.tags,
      status: entity.status,
      scopes: entity.scopes,
      stewards: entity.stewards,
      publishedVersion: summary(entity.publishedVersionId),
      openVersion: summary(entity.openVersionId),
      latestVersionNumber: entity.latestVersionNumber,
      publishedAt: iso(entity.publishedAt),
      archivedAt: iso(entity.archivedAt),
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      version: entity.version,
    };
  }

  toVersionSummary(
    entity: KnowledgeVersionEntity,
  ): ApiTypes.KnowledgeVersionSummary {
    return {
      id: entity.id,
      resourceId: entity.resourceId,
      number: entity.number,
      state: entity.state,
      checksum: entity.checksum,
      changeSummary: entity.changeSummary,
      basedOnVersionId: entity.basedOnVersionId,
      authoredBy: entity.authoredBy,
      revision: entity.revision,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      submittedAt: iso(entity.submittedAt),
      approvedAt: iso(entity.approvedAt),
      publishedAt: iso(entity.publishedAt),
      indexing:
        entity.indexingStatus && entity.indexingRequestedAt
          ? {
              status: entity.indexingStatus,
              itemId: entity.indexingItemId,
              chunkCount: entity.indexingChunkCount,
              error: entity.indexingError,
              requestedAt: entity.indexingRequestedAt.toISOString(),
              updatedAt: (
                entity.indexingUpdatedAt ?? entity.indexingRequestedAt
              ).toISOString(),
            }
          : null,
    };
  }

  toVersionResponse(
    entity: KnowledgeVersionEntity,
  ): ApiTypes.KnowledgeVersionResponse {
    return { ...this.toVersionSummary(entity), content: entity.content };
  }

  toReviewResponse(
    entity: KnowledgeReviewEntity,
  ): ApiTypes.KnowledgeReviewResponse {
    return {
      id: entity.id,
      versionId: entity.versionId,
      round: entity.round,
      state: entity.state,
      checksum: entity.checksum,
      comment: entity.comment,
      requestedBy: entity.requestedBy,
      requestedAt: entity.requestedAt.toISOString(),
      closedAt: iso(entity.closedAt),
      decisions: entity.decisions,
    };
  }

  toAuditEntry(entity: KnowledgeAuditEntity): ApiTypes.KnowledgeAuditEntry {
    return {
      id: entity.id,
      resourceId: entity.resourceId,
      versionId: entity.versionId,
      action: entity.action,
      actor: entity.actor,
      reason: entity.reason,
      changes: entity.changes,
      occurredAt: entity.occurredAt.toISOString(),
    };
  }

  toResourceSnapshot(entity: KnowledgeResourceEntity): KnowledgeResource {
    return {
      id: entity.id,
      projectId: entity.projectId,
      departmentId: entity.departmentId,
      knowledgeType: entity.knowledgeType,
      status: entity.status,
      tags: entity.tags,
      scopes: entity.scopes,
      stewards: entity.stewards,
      publishedVersionId: entity.publishedVersionId,
      latestVersionNumber: entity.latestVersionNumber,
    };
  }

  toVersionSnapshot(entity: KnowledgeVersionEntity): KnowledgeVersion {
    return {
      id: entity.id,
      number: entity.number,
      state: entity.state,
      checksum: entity.checksum,
      basedOnVersionId: entity.basedOnVersionId,
    };
  }
}
