import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  type AgoraEvents,
  type DomainEvent,
  DomainError,
  OnDomainEvent,
  Transactional,
} from '@hephaestus/core';

import type { CouncilVersion } from './council-version.js';
import { CouncilVersionsService } from './council-versions.service.js';
import { CouncilEntity } from './council.entity.js';

/** An event for a council the copy hasn't got yet: retried by the consumer. */
export class CouncilNotCopiedYetError extends Error {
  constructor(councilId: string) {
    super(`Council ${councilId} isn't in Hephaestus's copy yet`);
  }
}

export class CouncilUnavailableError extends DomainError {
  constructor(reason: string) {
    super(reason, 'COUNCIL_UNAVAILABLE');
  }
}

/**
 * Councils belong to Agora (../../../../docs/councils.md): Hephaestus keeps
 * a copy of them and their published versions from Agora's events
 * (`agora.events`), for the sessions it will run with them. Every change is
 * guarded by the council's `version` (the events' `aggregateVersion`), so a
 * late or repeated event never moves it back.
 */
@Injectable()
export class CouncilsService {
  constructor(
    @InjectRepository(CouncilEntity)
    private readonly councils: Repository<CouncilEntity>,
    private readonly versions: CouncilVersionsService,
  ) {}

  /**
   * The council's published version, for a new session: 404 unless the
   * council exists, `COUNCIL_UNAVAILABLE` when it's archived or has none.
   */
  async publishedVersion(
    organizationId: string,
    councilId: string,
  ): Promise<CouncilVersion> {
    const council = await this.councils.findOneBy({
      id: councilId,
      organizationId,
    });
    if (!council) {
      throw new NotFoundException(`Council ${councilId} not found`);
    }
    if (council.status !== 'active') {
      throw new CouncilUnavailableError(`Council ${councilId} is archived.`);
    }
    if (!council.latestVersionId) {
      throw new CouncilUnavailableError(
        `Council ${councilId} has no published version.`,
      );
    }
    return this.versions.findById(organizationId, council.latestVersionId);
  }

  /** A version of the organization's council (pinned by a session); 404 otherwise. */
  version(organizationId: string, versionId: string): Promise<CouncilVersion> {
    return this.versions.findById(organizationId, versionId);
  }

  @OnDomainEvent('agora.council.created')
  @Transactional()
  async onCreated(
    event: DomainEvent<AgoraEvents.CouncilCreated>,
  ): Promise<void> {
    const { payload } = event;
    await this.councils
      .createQueryBuilder()
      .insert()
      .values({
        id: payload.councilId,
        organizationId: organizationOf(event),
        key: payload.key,
        name: payload.name,
        description: payload.description,
        status: 'active',
        latestVersionId: null,
        version: event.aggregateVersion,
        createdAt: new Date(payload.createdAt),
        updatedAt: new Date(payload.createdAt),
      })
      .orIgnore()
      .execute();
  }

  @OnDomainEvent('agora.council.archived')
  @Transactional()
  async onArchived(
    event: DomainEvent<AgoraEvents.CouncilArchived>,
  ): Promise<void> {
    const council = await this.lockForEvent(event);
    if (council) {
      council.status = 'archived';
      await this.save(council, event);
    }
  }

  /**
   * Stores the version and makes it the published one, unless a newer
   * event got there first: then it's kept as deprecated.
   */
  @OnDomainEvent('agora.council-version.published')
  @Transactional()
  async onVersionPublished(
    event: DomainEvent<AgoraEvents.CouncilVersionPublished>,
  ): Promise<void> {
    const council = await this.lockForEvent(event);
    await this.versions.store(
      event.payload.version,
      council ? 'published' : 'deprecated',
    );
    if (council) {
      council.latestVersionId = event.payload.councilVersionId;
      await this.save(council, event);
    }
  }

  @OnDomainEvent('agora.council-version.deprecated')
  @Transactional()
  async onVersionDeprecated(
    event: DomainEvent<AgoraEvents.CouncilVersionDeprecated>,
  ): Promise<void> {
    // Deprecated is final, so this applies even when it arrives late.
    await this.versions.deprecate(event.payload.councilVersionId);
    const council = await this.lockForEvent(event);
    if (council) {
      await this.save(council, event);
    }
  }

  /**
   * The council, locked, if the event is newer than the copy; null when it
   * isn't. A council the copy doesn't have yet throws, so the consumer
   * retries once `council.created` is in.
   */
  private async lockForEvent(
    event: DomainEvent<{ councilId: string }>,
  ): Promise<CouncilEntity | null> {
    const council = await this.councils.findOne({
      where: {
        id: event.payload.councilId,
        organizationId: organizationOf(event),
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!council) {
      throw new CouncilNotCopiedYetError(event.payload.councilId);
    }
    return event.aggregateVersion <= council.version ? null : council;
  }

  private async save(
    council: CouncilEntity,
    event: DomainEvent<unknown>,
  ): Promise<void> {
    council.version = event.aggregateVersion;
    council.updatedAt = event.occurredAt;
    await this.councils.save(council);
  }
}

/** Agora's events always belong to an organization. */
function organizationOf(event: DomainEvent<unknown>): string {
  if (!event.organizationId) {
    throw new Error(`Agora event ${event.eventId} has no organization`);
  }
  return event.organizationId;
}
