import { Injectable } from '@nestjs/common';

import {
  OnDomainEvent,
  Transactional,
  type DomainEvent,
  type SeshatEvents,
} from '@episteme/core';

import { KnowledgeStore } from './knowledge.store.js';

/**
 * Seshat's answers for published versions (`seshat.asyncapi.yaml`,
 * `knowledge-indexing.completed` / `.failed`), kept on the version as its
 * `indexing`. A failure never replaces a version's success (a late
 * answer for an earlier read); an answer for a version that was never
 * published, or isn't the organization's, is ignored. Not audited and
 * not published: it's Seshat's state, not a governance change.
 */
@Injectable()
export class KnowledgeIndexingListener {
  constructor(private readonly store: KnowledgeStore) {}

  @OnDomainEvent('seshat.knowledge-indexing.completed')
  @Transactional()
  async onCompleted(
    event: DomainEvent<SeshatEvents.KnowledgeIndexingCompleted>,
  ): Promise<void> {
    const { resourceId, versionId, itemId, chunkCount } = event.payload;
    const version = await this.published(event, resourceId, versionId);
    if (!version) return;
    Object.assign(version, {
      indexingStatus: 'indexed',
      indexingItemId: itemId,
      indexingChunkCount: chunkCount,
      indexingError: null,
      indexingUpdatedAt: new Date(event.occurredAt),
    });
    await this.store.saveVersion(version);
  }

  @OnDomainEvent('seshat.knowledge-indexing.failed')
  @Transactional()
  async onFailed(
    event: DomainEvent<SeshatEvents.KnowledgeIndexingFailed>,
  ): Promise<void> {
    const { resourceId, versionId, error } = event.payload;
    const version = await this.published(event, resourceId, versionId);
    if (!version || version.indexingStatus === 'indexed') return;
    Object.assign(version, {
      indexingStatus: 'failed',
      indexingError: error,
      indexingUpdatedAt: new Date(event.occurredAt),
    });
    await this.store.saveVersion(version);
  }

  /** The version, locked, when it was published (it has an indexing state). */
  private async published(
    event: DomainEvent,
    resourceId: string,
    versionId: string,
  ) {
    if (!event.organizationId) return null;
    const version = await this.store.findVersionForUpdate(
      event.organizationId,
      resourceId,
      versionId,
    );
    return version?.indexingStatus ? version : null;
  }
}
