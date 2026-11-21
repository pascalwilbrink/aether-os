import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  type ApiTypes,
  type DomainEvent,
  findPage,
  mapPage,
  OnDomainEvent,
  type Page,
  type PageRequest,
  type ProxenosEvents,
  Transactional,
} from '@seshat/core';
import { TenancyService } from '@seshat/tenancy';

import {
  KnowledgeItemsService,
  type RepositoryDocumentFile,
} from './knowledge-items.service.js';
import { KnowledgeRepositoryEntity } from './knowledge-repository.entity.js';
import { KnowledgeRepositoryMapper } from './knowledge-repository.mapper.js';
import {
  KNOWLEDGE_OPTIONS,
  type KnowledgeOptions,
} from './knowledge.options.js';

type RepositoryResponse = ApiTypes.KnowledgeRepositoryResponse;

/** How long the syncer holds a repository it claimed. */
const SYNC_LEASE_MS = 5 * 60_000;
/** Tries before reading a repository fails until something asks again. */
const MAX_SYNC_ATTEMPTS = 6;

/** What reading a repository found (`RepositorySyncer`). */
export type SyncResult =
  | {
      kind: 'read';
      fullName: string;
      commit: string;
      files: RepositoryDocumentFile[];
      skippedCount: number;
      /** A warning kept on the repository (e.g. GitHub listed it in part). */
      note: string | null;
    }
  | { kind: 'failed'; error: string; retryable: boolean };

/**
 * Repositories linked to projects whose documents Seshat indexes
 * (../../../../docs/knowledge.md, Repository documents). Proxenos's events
 * add them (`git.repository-linked`, with the default paths), remove them
 * (`git.repository-unlinked`) and ask for them to be read again
 * (`git.pushed`); people choose the paths. `RepositorySyncer` reads them
 * and `KnowledgeItemsService` keeps their documents.
 */
@Injectable()
export class KnowledgeRepositoriesService {
  constructor(
    @InjectRepository(KnowledgeRepositoryEntity)
    private readonly repositories: Repository<KnowledgeRepositoryEntity>,
    private readonly mapper: KnowledgeRepositoryMapper,
    private readonly items: KnowledgeItemsService,
    private readonly tenancy: TenancyService,
    @Inject(KNOWLEDGE_OPTIONS) private readonly options: KnowledgeOptions,
  ) {}

  async list(
    organizationId: string,
    projectId: string,
    page: PageRequest,
  ): Promise<Page<RepositoryResponse>> {
    const entities = await findPage(
      this.repositories,
      {
        where: { organizationId, projectId },
        sortBy: 'createdAt',
        direction: 'ASC',
        idColumn: 'linkId',
      },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async findById(
    organizationId: string,
    projectId: string,
    linkId: string,
  ): Promise<RepositoryResponse> {
    return this.mapper.toResponse(
      await this.load(organizationId, projectId, linkId),
    );
  }

  /** Which paths are indexed; starts indexing a link that isn't yet. */
  @Transactional()
  async put(
    organizationId: string,
    projectId: string,
    linkId: string,
    dto: ApiTypes.PutKnowledgeRepositoryRequest,
  ): Promise<RepositoryResponse> {
    await this.tenancy.assertProjectAcceptsWrites(organizationId, projectId);
    const existing = await this.repositories.findOne({
      where: { linkId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      existing &&
      (existing.organizationId !== organizationId ||
        existing.projectId !== projectId)
    ) {
      // Another project's link.
      throw new NotFoundException(`Repository link ${linkId} not found`);
    }
    const entity =
      existing ?? this.newRepository(organizationId, projectId, linkId, null);
    entity.paths = dto.paths;
    requestSync(entity);
    await this.repositories.save(entity);
    return this.mapper.toResponse(entity);
  }

  /** Reads it again soon. */
  @Transactional()
  async sync(
    organizationId: string,
    projectId: string,
    linkId: string,
  ): Promise<RepositoryResponse> {
    await this.tenancy.assertProjectAcceptsWrites(organizationId, projectId);
    const entity = await this.load(organizationId, projectId, linkId, true);
    requestSync(entity);
    await this.repositories.save(entity);
    return this.mapper.toResponse(entity);
  }

  /** Stops indexing it: its documents are retired. */
  @Transactional()
  async remove(
    organizationId: string,
    projectId: string,
    linkId: string,
  ): Promise<void> {
    await this.tenancy.assertProjectAcceptsWrites(organizationId, projectId);
    const entity = await this.load(organizationId, projectId, linkId, true);
    await this.items.retireRepositoryDocuments(entity.linkId);
    await this.repositories.delete({ linkId: entity.linkId });
  }

  // ---- Proxenos's events ----

  /** A repository was linked to a project: index its default paths. */
  @OnDomainEvent('proxenos.git.repository-linked')
  @Transactional()
  async onLinked(
    event: DomainEvent<ProxenosEvents.GitRepositoryLinked>,
  ): Promise<void> {
    const { linkId, projectId, fullName } = event.payload;
    const { organizationId } = event;
    if (!organizationId) {
      return;
    }
    const existing = await this.repositories.findOneBy({ linkId });
    if (existing) {
      return; // Added already (redelivered, or by PUT).
    }
    const entity = this.newRepository(
      organizationId,
      projectId,
      linkId,
      fullName,
    );
    entity.paths = [...this.options.repositoryDefaultPaths];
    requestSync(entity);
    await this.repositories.insert(entity);
  }

  /** The link is gone: its documents are retired. */
  @OnDomainEvent('proxenos.git.repository-unlinked')
  @Transactional()
  async onUnlinked(
    event: DomainEvent<ProxenosEvents.GitRepositoryUnlinked>,
  ): Promise<void> {
    const { linkId } = event.payload;
    await this.items.retireRepositoryDocuments(linkId);
    await this.repositories.delete({ linkId });
  }

  /** The default branch moved: read the repository's links again. */
  @OnDomainEvent('proxenos.git.pushed')
  @Transactional()
  async onPushed(event: DomainEvent<ProxenosEvents.GitPushed>): Promise<void> {
    for (const { linkId } of event.payload.links) {
      const entity = await this.repositories.findOne({
        where: { linkId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!entity || entity.commit === event.payload.after) {
        continue; // Not indexed, or read at that commit already.
      }
      requestSync(entity);
      await this.repositories.save(entity);
    }
  }

  // ---- RepositorySyncer ----

  /**
   * The next repository waiting to be read, held for a few minutes (so
   * instances share the work); null when there's none.
   */
  @Transactional()
  async claim(now = new Date()): Promise<KnowledgeRepositoryEntity | null> {
    const entity = await this.repositories
      .createQueryBuilder('repository')
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .where(`repository.status = 'pending'`)
      .andWhere(
        '(repository.nextSyncAt IS NULL OR repository.nextSyncAt <= :now)',
        { now },
      )
      .orderBy('repository.nextSyncAt', 'ASC', 'NULLS FIRST')
      .addOrderBy('repository.updatedAt', 'ASC')
      .getOne();
    if (!entity) {
      return null;
    }
    entity.syncAttempts += 1;
    entity.nextSyncAt = new Date(now.getTime() + SYNC_LEASE_MS);
    await this.repositories.save(entity);
    return entity;
  }

  /**
   * Records how reading the repository at `revision` went, its documents
   * included. Asked to read it again meanwhile, it stays pending (with what
   * was read applied).
   */
  @Transactional()
  async finish(
    linkId: string,
    revision: number,
    result: SyncResult,
    now = new Date(),
  ): Promise<void> {
    const entity = await this.repositories.findOne({
      where: { linkId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!entity) {
      return; // Removed meanwhile.
    }
    const requestedAgain = entity.revision !== revision;
    if (result.kind === 'failed') {
      if (requestedAgain) {
        entity.nextSyncAt = null;
      } else if (result.retryable && entity.syncAttempts < MAX_SYNC_ATTEMPTS) {
        // Back off: a minute, doubled per try.
        entity.nextSyncAt = new Date(
          now.getTime() + 60_000 * 2 ** (entity.syncAttempts - 1),
        );
      } else {
        entity.status = 'failed';
        entity.nextSyncAt = null;
      }
      entity.error = result.error;
      entity.updatedAt = now;
      await this.repositories.save(entity);
      return;
    }
    entity.fullName = result.fullName;
    entity.documentCount = await this.items.syncRepositoryDocuments(
      {
        organizationId: entity.organizationId,
        projectId: entity.projectId,
        linkId: entity.linkId,
        fullName: result.fullName,
        commit: result.commit,
      },
      result.files,
    );
    entity.skippedCount = result.skippedCount;
    entity.commit = result.commit || null;
    entity.error = result.note;
    entity.syncedAt = now;
    entity.updatedAt = now;
    entity.nextSyncAt = null;
    if (!requestedAgain) {
      entity.status = 'synced';
      entity.syncAttempts = 0;
    }
    await this.repositories.save(entity);
  }

  // ---- helpers ----

  private newRepository(
    organizationId: string,
    projectId: string,
    linkId: string,
    fullName: string | null,
  ): KnowledgeRepositoryEntity {
    const now = new Date();
    return Object.assign(new KnowledgeRepositoryEntity(), {
      linkId,
      organizationId,
      projectId,
      fullName,
      paths: [],
      status: 'pending',
      commit: null,
      documentCount: 0,
      skippedCount: 0,
      error: null,
      revision: 0,
      syncAttempts: 0,
      nextSyncAt: null,
      syncedAt: null,
      createdAt: now,
      updatedAt: now,
    } satisfies KnowledgeRepositoryEntity);
  }

  /** Scoped to the project: another project's link is a 404. */
  private async load(
    organizationId: string,
    projectId: string,
    linkId: string,
    forUpdate = false,
  ): Promise<KnowledgeRepositoryEntity> {
    const entity = await this.repositories.findOne({
      where: { linkId, organizationId, projectId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(`Repository link ${linkId} not found`);
    }
    return entity;
  }
}

/** Waits to be read (again), at once; a sync already running won't mark it synced. */
function requestSync(entity: KnowledgeRepositoryEntity): void {
  entity.status = 'pending';
  entity.revision += 1;
  entity.syncAttempts = 0;
  entity.nextSyncAt = null;
  entity.updatedAt = new Date();
}
