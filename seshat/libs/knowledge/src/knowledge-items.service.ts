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
} from './knowledge.errors.js';
import { KnowledgeVersionsService } from './knowledge-versions.service.js';

type ItemResponse = ApiTypes.KnowledgeItemResponse;

/** How a document's indexing ended (`DocumentIndexer`). */
export type IndexingResult =
  | { kind: 'text'; text: string }
  | { kind: 'unsupported' }
  | { kind: 'failed'; error: string; retryable: boolean };

/** Tries before a document's indexing fails for good. */
const MAX_INDEXING_ATTEMPTS = 5;
/** How long an indexer holds a document it claimed. */
const INDEXING_LEASE_MS = 5 * 60_000;

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
    await this.save(item, 'knowledge-item.indexed');
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
      indexingStatus: null,
      indexingError: null,
      chunkCount: 0,
      indexingAttempts: 0,
      nextIndexAt: null,
      indexedAt: null,
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

  private async newVersion(item: KnowledgeItemEntity): Promise<void> {
    item.version += 1;
    item.updatedBy = this.access.principal().sub;
    item.updatedAt = new Date();
    await this.versions.record(item);
    await this.save(item, 'knowledge-item.updated');
  }

  /** A written item's passages (its title and body), searchable at once. */
  private async indexText(item: KnowledgeItemEntity): Promise<void> {
    item.chunkCount = await this.chunks.replace(item, item.body);
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
