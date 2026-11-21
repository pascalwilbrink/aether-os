import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import {
  AccessControl,
  type ApiTypes,
  findPage,
  mapPage,
  type Page,
  type PageRequest,
  redactText,
  SeshatEvents,
  type SeshatEventType,
  Transactional,
} from '@seshat/core';
import { TenancyService } from '@seshat/tenancy';

import type { DocumentFile } from './document-files.js';
import { KnowledgeChunksService } from './knowledge-chunks.service.js';
import {
  KnowledgeItemEntity,
  type KnowledgeItemType,
} from './knowledge-item.entity.js';
import { KnowledgeItemMapper } from './knowledge-item.mapper.js';
import {
  isEditable,
  type KnowledgeItemAction,
  nextKnowledgeItemStatus,
} from './knowledge-transitions.js';
import {
  KnowledgeItemInvalidError,
  KnowledgeItemInvalidTransitionError,
  KnowledgeItemReadOnlyError,
} from './knowledge.errors.js';
import { KnowledgeVersionsService } from './knowledge-versions.service.js';

type ItemResponse = ApiTypes.KnowledgeItemResponse;

/** A file of an indexed repository, as its document records it. */
export interface RepositoryDocumentFile {
  path: string;
  blobSha: string;
  sizeBytes: number;
  url: string;
  contentType: string;
}

/** A repository whose documents are synced (`RepositorySyncer`). */
export interface RepositoryDocumentsSource {
  organizationId: string;
  projectId: string;
  linkId: string;
  fullName: string;
  commit: string;
}

/** How a document's indexing ended (`DocumentIndexer`). */
export type IndexingResult =
  | { kind: 'text'; text: string }
  | { kind: 'unsupported' }
  | { kind: 'failed'; error: string; retryable: boolean };

/** Tries before a document's indexing fails for good. */
const MAX_INDEXING_ATTEMPTS = 5;
/** How long an indexer holds a document it claimed. */
const INDEXING_LEASE_MS = 5 * 60_000;
/** How long the embedder holds an item it took. */
const EMBEDDING_LEASE_MS = 5 * 60_000;
/** The longest wait before embedding is tried again (and the wait for a failure that won't pass soon). */
const MAX_EMBEDDING_BACKOFF_MS = 6 * 60 * 60_000;

/** How embedding an item's passages went. */
export type EmbeddingResult =
  | {
      kind: 'embedded';
      model: string;
      vectors: { chunkId: string; vector: number[] }[];
    }
  | { kind: 'failed'; error: string; retryable: boolean };

/**
 * A project's knowledge items (../../../../docs/knowledge.md): written by
 * people (`accepted` at once) or proposed by agents (service accounts:
 * `proposed`, for someone with `knowledge:approve`), versioned (every edit
 * is a new version, the old ones kept), searchable (their passages, in
 * `KnowledgeChunksService`). Every change bumps the item's `revision` and
 * publishes an event in its transaction.
 */
@Injectable()
export class KnowledgeItemsService {
  constructor(
    @InjectRepository(KnowledgeItemEntity)
    private readonly items: Repository<KnowledgeItemEntity>,
    private readonly mapper: KnowledgeItemMapper,
    private readonly versions: KnowledgeVersionsService,
    private readonly chunks: KnowledgeChunksService,
    private readonly tenancy: TenancyService,
    private readonly access: AccessControl,
    private readonly events: SeshatEvents,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    projectId: string,
    dto: ApiTypes.CreateKnowledgeItemRequest,
  ): Promise<ItemResponse> {
    await this.tenancy.assertProjectAcceptsWrites(organizationId, projectId);
    const superseded = dto.supersedes
      ? await this.supersedable(organizationId, projectId, dto.supersedes)
      : null;
    const item = this.newItem(organizationId, projectId, dto.type, {
      title: dto.title,
      body: redactText(dto.body, { keepEmails: true }),
      tags: dto.tags ?? [],
      references: dto.references ?? [],
      supersedes: dto.supersedes ?? null,
      reviewBy: dto.reviewBy ?? null,
    });
    await this.items.insert(item);
    await this.versions.record(item);
    await this.emit(
      item,
      item.status === 'accepted'
        ? 'knowledge-item.accepted'
        : 'knowledge-item.proposed',
    );
    if (superseded && item.status === 'accepted') {
      await this.supersede(superseded, item.id);
    }
    await this.indexText(item);

    return this.mapper.toResponse(item);
  }

  async list(
    organizationId: string,
    projectId: string,
    filters: { type?: KnowledgeItemType; status?: ItemResponse['status'] },
    page: PageRequest,
  ): Promise<Page<ItemResponse>> {
    const entities = await findPage(
      this.items,
      {
        where: {
          organizationId,
          projectId,
          ...(filters.type ? { type: filters.type } : {}),
          ...(filters.status ? { status: filters.status } : {}),
        },
        sortBy: 'createdAt',
        direction: 'DESC',
      },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async findById(
    organizationId: string,
    projectId: string,
    itemId: string,
  ): Promise<ItemResponse> {
    return this.mapper.toResponse(
      await this.load(organizationId, projectId, itemId),
    );
  }

  /** The items with these IDs in the project, in no particular order. */
  async findMany(
    organizationId: string,
    projectId: string,
    itemIds: string[],
  ): Promise<ItemResponse[]> {
    if (itemIds.length === 0) {
      return [];
    }
    const entities = await this.items.findBy({
      organizationId,
      projectId,
      id: In(itemIds),
    });
    return entities.map((entity) => this.mapper.toResponse(entity));
  }

  async versionsOf(
    organizationId: string,
    projectId: string,
    itemId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.KnowledgeItemVersionResponse>> {
    await this.load(organizationId, projectId, itemId);
    return this.versions.list(itemId, page);
  }

  /** The item's current version's passages, in order (a document's text). */
  async passagesOf(
    organizationId: string,
    projectId: string,
    itemId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.KnowledgePassage>> {
    const item = await this.load(organizationId, projectId, itemId);
    return this.chunks.page(item.id, item.version, page);
  }

  /** A new version of a written item. Agents may only change proposals. */
  @Transactional()
  async update(
    organizationId: string,
    projectId: string,
    itemId: string,
    dto: ApiTypes.UpdateKnowledgeItemRequest,
  ): Promise<ItemResponse> {
    await this.tenancy.assertProjectAcceptsWrites(organizationId, projectId);
    const item = await this.load(organizationId, projectId, itemId, true);
    assertNotFromRepository(item);
    if (item.type === 'document') {
      throw new KnowledgeItemInvalidError(
        `Knowledge item ${itemId} is a document: change it with PUT …/documents/${itemId}.`,
      );
    }
    this.assertEditable(item);
    Object.assign(item, {
      title: dto.title,
      body: redactText(dto.body, { keepEmails: true }),
      tags: dto.tags ?? item.tags,
      references: dto.references ?? item.references,
      reviewBy: dto.reviewBy === undefined ? item.reviewBy : dto.reviewBy,
    });
    await this.newVersion(item);
    await this.indexText(item);
    return this.mapper.toResponse(item);
  }

  @Transactional()
  async accept(
    organizationId: string,
    projectId: string,
    itemId: string,
  ): Promise<ItemResponse> {
    await this.tenancy.assertProjectAcceptsWrites(organizationId, projectId);
    const item = await this.load(organizationId, projectId, itemId, true);
    assertNotFromRepository(item);
    if (item.status === 'accepted') {
      return this.mapper.toResponse(item);
    }
    const superseded = item.supersedes
      ? await this.supersedable(organizationId, projectId, item.supersedes)
      : null;
    this.move(item, 'accept');
    item.acceptedBy = this.access.principal().sub;
    item.acceptedAt = new Date();
    await this.save(item, 'knowledge-item.accepted');
    if (superseded) {
      await this.supersede(superseded, item.id);
    }
    return this.mapper.toResponse(item);
  }

  @Transactional()
  async reject(
    organizationId: string,
    projectId: string,
    itemId: string,
  ): Promise<ItemResponse> {
    return this.act(organizationId, projectId, itemId, 'reject', 'rejected');
  }

  @Transactional()
  async retire(
    organizationId: string,
    projectId: string,
    itemId: string,
  ): Promise<ItemResponse> {
    return this.act(organizationId, projectId, itemId, 'retire', 'retired');
  }

  // ---- documents (DocumentsService, DocumentIndexer) ----

  /** A new document item for a file Loculus has, waiting to be indexed. */
  @Transactional()
  async createDocument(
    organizationId: string,
    projectId: string,
    file: DocumentFile,
    dto: { title?: string; tags?: string[] },
  ): Promise<ItemResponse> {
    await this.tenancy.assertProjectAcceptsWrites(organizationId, projectId);
    const item = this.newItem(organizationId, projectId, 'document', {
      title: dto.title ?? file.fileName,
      body: '',
      tags: dto.tags ?? [],
      references: [],
      supersedes: null,
      reviewBy: null,
    });
    this.setFile(item, file);
    await this.items.insert(item);
    await this.versions.record(item);
    await this.emit(
      item,
      item.status === 'accepted'
        ? 'knowledge-item.accepted'
        : 'knowledge-item.proposed',
    );
    return this.mapper.toResponse(item);
  }

  /** A new version of a document: another file, indexed again. */
  @Transactional()
  async updateDocument(
    organizationId: string,
    projectId: string,
    itemId: string,
    file: DocumentFile,
    dto: { title?: string; tags?: string[] },
  ): Promise<ItemResponse> {
    await this.tenancy.assertProjectAcceptsWrites(organizationId, projectId);
    const item = await this.load(organizationId, projectId, itemId, true);
    assertNotFromRepository(item);
    if (item.type !== 'document') {
      throw new KnowledgeItemInvalidError(
        `Knowledge item ${itemId} isn't a document: change it with PUT …/items/${itemId}.`,
      );
    }
    this.assertEditable(item);
    item.title = dto.title ?? item.title;
    item.tags = dto.tags ?? item.tags;
    this.setFile(item, file);
    await this.newVersion(item);
    return this.mapper.toResponse(item);
  }

  /**
   * The next searchable item (accepted or proposed) whose passages wait for
   * vectors, held for a few minutes (so instances share the work); null
   * when there's none.
   */
  @Transactional()
  async claimForEmbedding(
    now = new Date(),
  ): Promise<KnowledgeItemEntity | null> {
    const item = await this.items
      .createQueryBuilder('item')
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .where(`item.embeddingStatus = 'pending'`)
      .andWhere(`item.status IN ('accepted', 'proposed')`)
      .andWhere('(item.nextEmbedAt IS NULL OR item.nextEmbedAt <= :now)', {
        now,
      })
      .orderBy('item.nextEmbedAt', 'ASC', 'NULLS FIRST')
      .addOrderBy('item.updatedAt', 'ASC')
      .getOne();
    if (!item) {
      return null;
    }
    item.embeddingAttempts += 1;
    item.nextEmbedAt = new Date(now.getTime() + EMBEDDING_LEASE_MS);
    await this.items.save(item);
    return item;
  }

  /**
   * Records how embedding an item's version went: its vectors stored, or
   * tried again later (a minute, doubled per try, at most six hours; six
   * hours for a failure only a change of configuration fixes). A version
   * replaced in the meantime is left alone (its passages wait their turn).
   */
  @Transactional()
  async finishEmbedding(
    itemId: string,
    version: number,
    result: EmbeddingResult,
    now = new Date(),
  ): Promise<void> {
    const item = await this.items.findOne({
      where: { id: itemId },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !item ||
      item.version !== version ||
      item.embeddingStatus !== 'pending'
    ) {
      return;
    }
    if (result.kind === 'failed') {
      item.embeddingError = result.error;
      item.nextEmbedAt = new Date(
        now.getTime() +
          (result.retryable
            ? Math.min(
                60_000 * 2 ** (item.embeddingAttempts - 1),
                MAX_EMBEDDING_BACKOFF_MS,
              )
            : MAX_EMBEDDING_BACKOFF_MS),
      );
      await this.items.save(item);
      return;
    }
    await this.chunks.storeEmbeddings(item, result.model, result.vectors);
    item.embeddingStatus = 'embedded';
    item.embeddingModel = result.model;
    item.embeddingAttempts = 0;
    item.embeddingError = null;
    item.nextEmbedAt = null;
    item.embeddedAt = now;
    await this.items.save(item);
  }

  /**
   * Items embedded with another model than `model` wait to be embedded
   * again: a project's vectors are only comparable from one model.
   */
  async requeueEmbeddingsNotFrom(model: string): Promise<number> {
    const result = await this.items
      .createQueryBuilder()
      .update()
      .set({
        embeddingStatus: 'pending',
        embeddingAttempts: 0,
        nextEmbedAt: null,
        embeddingError: null,
      })
      .where(`embedding_status = 'embedded' AND embedding_model <> :model`, {
        model,
      })
      .execute();
    return result.affected ?? 0;
  }

  /**
   * The next document waiting to be indexed, held for a few minutes (so
   * instances share the work); null when there's none.
   */
  @Transactional()
  async claimDocument(now = new Date()): Promise<KnowledgeItemEntity | null> {
    const item = await this.items
      .createQueryBuilder('item')
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .where(`item.indexingStatus = 'pending'`)
      .andWhere('(item.nextIndexAt IS NULL OR item.nextIndexAt <= :now)', {
        now,
      })
      .orderBy('item.nextIndexAt', 'ASC', 'NULLS FIRST')
      .addOrderBy('item.updatedAt', 'ASC')
      .getOne();
    if (!item) {
      return null;
    }
    item.indexingAttempts += 1;
    item.nextIndexAt = new Date(now.getTime() + INDEXING_LEASE_MS);
    await this.items.save(item);
    return item;
  }

  /**
   * Records how indexing a document's version went. A version replaced in
   * the meantime is left alone (its new version waits its turn).
   */
  @Transactional()
  async finishIndexing(
    itemId: string,
    version: number,
    result: IndexingResult,
    now = new Date(),
  ): Promise<void> {
    const item = await this.items.findOne({
      where: { id: itemId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!item || item.version !== version) {
      return;
    }
    if (result.kind === 'failed') {
      const again =
        result.retryable && item.indexingAttempts < MAX_INDEXING_ATTEMPTS;
      item.indexingError = result.error;
      if (again) {
        // Back off: a minute, doubled per try.
        item.nextIndexAt = new Date(
          now.getTime() + 60_000 * 2 ** (item.indexingAttempts - 1),
        );
      } else {
        item.indexingStatus = 'failed';
        item.nextIndexAt = null;
      }
      await this.items.save(item);
      return;
    }
    item.indexingError = null;
    item.nextIndexAt = null;
    item.indexedAt = now;
    if (result.kind === 'unsupported') {
      item.indexingStatus = 'unsupported';
      item.chunkCount = await this.chunks.replace(item, '');
    } else {
      item.indexingStatus = 'indexed';
      item.chunkCount = await this.chunks.replace(item, result.text);
    }
    awaitEmbedding(item);
    await this.save(item, 'knowledge-item.indexed');
  }

  // ---- repository documents (RepositorySyncer) ----

  /**
   * Makes the repository's documents match its files at `source.commit`:
   * a new file is a new accepted document, a changed one (another blob) a
   * new version, a file no longer there retires its document; each waits
   * to be indexed. Unchanged files keep their version. How many current
   * documents it has.
   */
  @Transactional()
  async syncRepositoryDocuments(
    source: RepositoryDocumentsSource,
    files: readonly RepositoryDocumentFile[],
  ): Promise<number> {
    const current = await this.items
      .createQueryBuilder('item')
      .setLock('pessimistic_write')
      .where('item.repositoryLinkId = :linkId', { linkId: source.linkId })
      .andWhere(`item.status <> 'retired'`)
      .getMany();
    const byPath = new Map(current.map((item) => [item.repositoryPath, item]));
    const by = repositoryActor(source.fullName);
    for (const file of files) {
      const item = byPath.get(file.path);
      byPath.delete(file.path);
      if (!item) {
        const created = this.repositoryDocument(source, file, by);
        await this.items.insert(created);
        await this.versions.record(created);
        await this.emit(created, 'knowledge-item.accepted');
      } else if (item.repositoryBlobSha !== file.blobSha) {
        setRepositoryFile(item, source, file);
        await this.newVersion(item, by);
      }
    }
    // Files no longer under its paths: their documents are retired.
    for (const item of byPath.values()) {
      this.move(item, 'retire');
      item.updatedBy = by;
      await this.save(item, 'knowledge-item.retired');
    }
    return files.length;
  }

  /** Retires every document of the repository (it's no longer indexed). */
  @Transactional()
  async retireRepositoryDocuments(linkId: string): Promise<number> {
    const items = await this.items
      .createQueryBuilder('item')
      .setLock('pessimistic_write')
      .where('item.repositoryLinkId = :linkId', { linkId })
      .andWhere(`item.status <> 'retired'`)
      .getMany();
    for (const item of items) {
      this.move(item, 'retire');
      item.updatedBy = repositoryActor(item.repositoryFullName ?? '');
      await this.save(item, 'knowledge-item.retired');
    }
    return items.length;
  }

  private repositoryDocument(
    source: RepositoryDocumentsSource,
    file: RepositoryDocumentFile,
    by: string,
  ): KnowledgeItemEntity {
    const now = new Date();
    const item = Object.assign(new KnowledgeItemEntity(), {
      id: uuidv7(),
      organizationId: source.organizationId,
      projectId: source.projectId,
      type: 'document',
      title: file.path,
      body: '',
      status: 'accepted',
      version: 1,
      revision: 0,
      tags: [],
      references: [],
      sourceKind: 'repository',
      sourceTaskId: null,
      supersedes: null,
      supersededBy: null,
      reviewBy: null,
      fileId: null,
      fileName: null,
      contentType: null,
      sizeBytes: null,
      sha256: null,
      repositoryLinkId: null,
      repositoryFullName: null,
      repositoryPath: null,
      repositoryCommit: null,
      repositoryBlobSha: null,
      repositoryUrl: null,
      indexingStatus: null,
      indexingError: null,
      chunkCount: 0,
      indexingAttempts: 0,
      nextIndexAt: null,
      indexedAt: null,
      embeddingStatus: null,
      embeddingModel: null,
      embeddingAttempts: 0,
      nextEmbedAt: null,
      embeddingError: null,
      embeddedAt: null,
      createdBy: by,
      updatedBy: by,
      // The repository is its source of truth: accepted as committed.
      acceptedBy: by,
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    } satisfies KnowledgeItemEntity);
    setRepositoryFile(item, source, file);
    return item;
  }

  // ---- helpers ----

  private newItem(
    organizationId: string,
    projectId: string,
    type: KnowledgeItemType,
    content: Pick<
      KnowledgeItemEntity,
      'title' | 'body' | 'tags' | 'references' | 'supersedes' | 'reviewBy'
    >,
  ): KnowledgeItemEntity {
    const principal = this.access.principal();
    // People write knowledge; agents (service accounts) propose it.
    const person = principal.subType === 'user';
    const now = new Date();
    return Object.assign(new KnowledgeItemEntity(), {
      id: uuidv7(),
      organizationId,
      projectId,
      type,
      ...content,
      status: person ? 'accepted' : 'proposed',
      version: 1,
      revision: 0,
      sourceKind: person ? 'person' : 'task',
      sourceTaskId: person ? null : principal.taskId,
      supersededBy: null,
      fileId: null,
      fileName: null,
      contentType: null,
      sizeBytes: null,
      sha256: null,
      repositoryLinkId: null,
      repositoryFullName: null,
      repositoryPath: null,
      repositoryCommit: null,
      repositoryBlobSha: null,
      repositoryUrl: null,
      indexingStatus: null,
      indexingError: null,
      chunkCount: 0,
      indexingAttempts: 0,
      nextIndexAt: null,
      indexedAt: null,
      embeddingStatus: null,
      embeddingModel: null,
      embeddingAttempts: 0,
      nextEmbedAt: null,
      embeddingError: null,
      embeddedAt: null,
      createdBy: principal.sub,
      updatedBy: principal.sub,
      acceptedBy: person ? principal.sub : null,
      acceptedAt: person ? now : null,
      createdAt: now,
      updatedAt: now,
    } satisfies KnowledgeItemEntity);
  }

  private setFile(item: KnowledgeItemEntity, file: DocumentFile): void {
    Object.assign(item, {
      fileId: file.id,
      fileName: file.fileName,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
      indexingStatus: 'pending',
      indexingError: null,
      indexingAttempts: 0,
      nextIndexAt: null,
      indexedAt: null,
    } satisfies Partial<KnowledgeItemEntity>);
  }

  /** Agents only change proposals; nobody changes a finished item. */
  private assertEditable(item: KnowledgeItemEntity): void {
    if (!isEditable(item.status)) {
      throw new KnowledgeItemInvalidTransitionError(
        item.id,
        item.status,
        'edited',
      );
    }
    if (
      item.status === 'accepted' &&
      this.access.principal().subType !== 'user'
    ) {
      throw new KnowledgeItemInvalidError(
        `Knowledge item ${item.id} is accepted: an agent proposes a change as a new item that supersedes it.`,
      );
    }
  }

  private async newVersion(
    item: KnowledgeItemEntity,
    by = this.access.principal().sub,
  ): Promise<void> {
    item.version += 1;
    item.updatedBy = by;
    item.updatedAt = new Date();
    await this.versions.record(item);
    await this.save(item, 'knowledge-item.updated');
  }

  /** A written item's passages (its title and body), searchable at once. */
  private async indexText(item: KnowledgeItemEntity): Promise<void> {
    item.chunkCount = await this.chunks.replace(item, item.body);
    awaitEmbedding(item);
    await this.save(item, 'knowledge-item.indexed');
  }

  private async act(
    organizationId: string,
    projectId: string,
    itemId: string,
    action: KnowledgeItemAction,
    done: ItemResponse['status'],
  ): Promise<ItemResponse> {
    await this.tenancy.assertProjectAcceptsWrites(organizationId, projectId);
    const item = await this.load(organizationId, projectId, itemId, true);
    assertNotFromRepository(item);
    if (item.status !== done) {
      this.move(item, action);
      await this.save(
        item,
        action === 'reject'
          ? 'knowledge-item.rejected'
          : 'knowledge-item.retired',
      );
    }
    return this.mapper.toResponse(item);
  }

  private move(item: KnowledgeItemEntity, action: KnowledgeItemAction): void {
    const next = nextKnowledgeItemStatus(item.status, action);
    if (!next) {
      const target = {
        accept: 'accepted',
        reject: 'rejected',
        supersede: 'superseded',
        retire: 'retired',
      } as const;
      throw new KnowledgeItemInvalidTransitionError(
        item.id,
        item.status,
        target[action],
      );
    }
    item.status = next;
  }

  /** An accepted item of the project that a new one may replace. */
  private async supersedable(
    organizationId: string,
    projectId: string,
    itemId: string,
  ): Promise<KnowledgeItemEntity> {
    const item = await this.items.findOne({
      where: { id: itemId, organizationId, projectId },
      lock: { mode: 'pessimistic_write' },
    });
    if (item?.status !== 'accepted') {
      throw new KnowledgeItemInvalidError(
        `supersedes must name an accepted item of the project (${itemId} isn't one).`,
      );
    }
    assertNotFromRepository(item);
    return item;
  }

  private async supersede(
    item: KnowledgeItemEntity,
    by: string,
  ): Promise<void> {
    this.move(item, 'supersede');
    item.supersededBy = by;
    await this.save(item, 'knowledge-item.superseded');
  }

  private async save(
    item: KnowledgeItemEntity,
    eventType: SeshatEventType,
  ): Promise<void> {
    item.updatedAt = new Date();
    await this.items.save(item);
    await this.emit(item, eventType);
  }

  /** Publishes the item's event; its `aggregateVersion` is the next revision. */
  private async emit(
    item: KnowledgeItemEntity,
    eventType: SeshatEventType,
  ): Promise<void> {
    item.revision += 1;
    await this.items.update({ id: item.id }, { revision: item.revision });
    const base = {
      aggregateId: item.id,
      aggregateVersion: item.revision,
      organizationId: item.organizationId,
      projectId: item.projectId,
    };
    if (eventType === 'knowledge-item.indexed') {
      await this.events.emit({
        ...base,
        eventType,
        payload: {
          itemId: item.id,
          projectId: item.projectId,
          version: item.version,
          chunkCount: item.chunkCount,
        },
      });
      return;
    }
    await this.events.emit({
      ...base,
      eventType,
      payload: {
        itemId: item.id,
        projectId: item.projectId,
        type: item.type,
        status: item.status,
        version: item.version,
        sourceKind: item.sourceKind,
        supersededBy: item.supersededBy,
      },
    });
  }

  /** Scoped to the project: another project's item is a 404. */
  private async load(
    organizationId: string,
    projectId: string,
    itemId: string,
    forUpdate = false,
  ): Promise<KnowledgeItemEntity> {
    const item = await this.items.findOne({
      where: { id: itemId, organizationId, projectId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!item) {
      throw new NotFoundException(`Knowledge item ${itemId} not found`);
    }
    return item;
  }
}

/** Who changed a repository document: the repository, not a person. */
function repositoryActor(fullName: string): string {
  return `repository:${fullName}`;
}

/** A repository document's file (this version), waiting to be indexed. */
function setRepositoryFile(
  item: KnowledgeItemEntity,
  source: RepositoryDocumentsSource,
  file: RepositoryDocumentFile,
): void {
  Object.assign(item, {
    fileName: file.path.split('/').pop() ?? file.path,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    repositoryLinkId: source.linkId,
    repositoryFullName: source.fullName,
    repositoryPath: file.path,
    repositoryCommit: source.commit,
    repositoryBlobSha: file.blobSha,
    repositoryUrl: file.url,
    indexingStatus: 'pending',
    indexingError: null,
    indexingAttempts: 0,
    nextIndexAt: null,
    indexedAt: null,
  } satisfies Partial<KnowledgeItemEntity>);
}

/** Repository documents change with commits, never through the API. */
function assertNotFromRepository(item: KnowledgeItemEntity): void {
  if (item.sourceKind === 'repository') {
    throw new KnowledgeItemReadOnlyError(item.id, item.repositoryFullName);
  }
}

/** New passages wait for their vectors (none to embed without passages). */
function awaitEmbedding(item: KnowledgeItemEntity): void {
  item.embeddingStatus = item.chunkCount > 0 ? 'pending' : null;
  item.embeddingAttempts = 0;
  item.nextEmbedAt = null;
  item.embeddingError = null;
}
