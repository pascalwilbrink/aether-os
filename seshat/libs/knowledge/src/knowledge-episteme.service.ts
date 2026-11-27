import { Injectable, Logger } from '@nestjs/common';

import {
  type DomainEvent,
  type EpistemeEvents,
  OnDomainEvent,
  SeshatEvents,
  Transactional,
} from '@seshat/core';

import {
  EpistemeSource,
  EpistemeSourceError,
  type EpistemePublished,
} from './episteme-source.js';
import { KnowledgeItemsService } from './knowledge-items.service.js';

/** Episteme's events that may change what it has published. */
export const EPISTEME_SUBSCRIPTIONS = [
  'knowledge-version.published',
  'knowledge-version.withdrawn',
  'knowledge-resource.updated',
  'knowledge-resource.archived',
  'knowledge-resource.deleted',
] as const;

/**
 * Episteme's published knowledge, indexed where its resource belongs
 * (../../../../docs/knowledge.md, Episteme's knowledge): a project's in
 * the project, a department's in the department, the organization's
 * everywhere in it. Every event only says which resource changed: Seshat
 * reads the resource as it is now (`EpistemeSource`) and makes its item
 * match, so events out of order or redelivered do no harm. A publication
 * is answered with `knowledge-indexing.completed` or `.failed`, which
 * Episteme keeps on the version.
 */
@Injectable()
export class KnowledgeEpistemeService {
  private readonly logger = new Logger(KnowledgeEpistemeService.name);

  constructor(
    private readonly source: EpistemeSource,
    private readonly items: KnowledgeItemsService,
    private readonly events: SeshatEvents,
  ) {}

  @OnDomainEvent('episteme.knowledge-version.published')
  @Transactional()
  async onPublished(
    event: DomainEvent<EpistemeEvents.KnowledgeVersionPublished>,
  ): Promise<void> {
    const { resource, version } = event.payload;
    await this.reconcile(event.organizationId, resource.id, {
      versionId: version.id,
      versionNumber: version.number,
    });
  }

  @OnDomainEvent('episteme.knowledge-version.withdrawn')
  @Transactional()
  async onWithdrawn(
    event: DomainEvent<EpistemeEvents.KnowledgeVersionWithdrawn>,
  ): Promise<void> {
    await this.reconcile(event.organizationId, event.payload.resourceId);
  }

  @OnDomainEvent('episteme.knowledge-resource.updated')
  @Transactional()
  async onUpdated(
    event: DomainEvent<EpistemeEvents.KnowledgeResourceUpdated>,
  ): Promise<void> {
    await this.reconcile(event.organizationId, event.payload.resource.id);
  }

  @OnDomainEvent('episteme.knowledge-resource.archived')
  @Transactional()
  async onArchived(
    event: DomainEvent<EpistemeEvents.KnowledgeResourceArchived>,
  ): Promise<void> {
    await this.reconcile(event.organizationId, event.payload.resource.id);
  }

  @OnDomainEvent('episteme.knowledge-resource.deleted')
  @Transactional()
  async onDeleted(
    event: DomainEvent<EpistemeEvents.KnowledgeResourceDeleted>,
  ): Promise<void> {
    // Gone in Episteme: nothing to read.
    await this.items.retireEpistemeItem(event.payload.resourceId, null);
  }

  /**
   * Makes the resource's item match Episteme. With `published` (a
   * publication), answers for it: completed with the version it now
   * holds, or failed when Episteme refuses for good. A failure that may
   * pass (Episteme not answering) is thrown, for the inbox to retry.
   */
  private async reconcile(
    organizationId: string | null,
    resourceId: string,
    published?: { versionId: string; versionNumber: number },
  ): Promise<void> {
    if (!organizationId || !this.source.configured) {
      return;
    }
    let state;
    try {
      state = await this.source.read(organizationId, resourceId);
    } catch (error) {
      if (error instanceof EpistemeSourceError && !error.retryable) {
        this.logger.warn(
          `Episteme resource ${resourceId} couldn't be read: ${error.message}`,
        );
        if (published) {
          await this.answerFailed(organizationId, resourceId, published, error);
        }
        return;
      }
      throw error;
    }
    if (state.kind === 'gone') {
      await this.items.retireEpistemeItem(resourceId, null);
      return;
    }
    if (state.kind === 'unpublished') {
      await this.items.retireEpistemeItem(resourceId, state.resourceVersion);
      return;
    }
    const item = await this.items.syncEpistemeItem(state.published);
    if (published && item.epistemeVersionId === published.versionId) {
      await this.answerCompleted(state.published, item);
    }
    // A newer version is published already: its own event answers for it.
  }

  private async answerCompleted(
    published: EpistemePublished,
    item: { id: string; version: number; chunkCount: number },
  ): Promise<void> {
    await this.events.emit({
      eventType: 'knowledge-indexing.completed',
      aggregateId: published.resourceId,
      aggregateVersion: published.resourceVersion,
      organizationId: published.organizationId,
      projectId: published.projectId,
      payload: {
        resourceId: published.resourceId,
        versionId: published.versionId,
        versionNumber: published.versionNumber,
        itemId: item.id,
        itemVersion: item.version,
        chunkCount: item.chunkCount,
      },
    });
  }

  private async answerFailed(
    organizationId: string,
    resourceId: string,
    published: { versionId: string; versionNumber: number },
    error: Error,
  ): Promise<void> {
    await this.events.emit({
      eventType: 'knowledge-indexing.failed',
      aggregateId: resourceId,
      // Nothing was read: the version's number stands in for the resource's.
      aggregateVersion: published.versionNumber,
      organizationId,
      projectId: null,
      payload: {
        resourceId,
        versionId: published.versionId,
        versionNumber: published.versionNumber,
        error: error.message,
      },
    });
  }
}
