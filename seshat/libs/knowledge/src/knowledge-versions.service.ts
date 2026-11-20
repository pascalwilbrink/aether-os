import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  type ApiTypes,
  findPage,
  mapPage,
  type Page,
  type PageRequest,
  Transactional,
} from '@seshat/core';

import { KnowledgeItemVersionEntity } from './knowledge-item-version.entity.js';
import type { KnowledgeItemEntity } from './knowledge-item.entity.js';
import { KnowledgeItemMapper } from './knowledge-item.mapper.js';

/** Items' history: every version as it was, never changed. */
@Injectable()
export class KnowledgeVersionsService {
  constructor(
    @InjectRepository(KnowledgeItemVersionEntity)
    private readonly versions: Repository<KnowledgeItemVersionEntity>,
    private readonly mapper: KnowledgeItemMapper,
  ) {}

  /** Records the item's current version. */
  @Transactional()
  async record(item: KnowledgeItemEntity): Promise<void> {
    await this.versions.insert(this.mapper.toVersionEntity(item));
  }

  async list(
    itemId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.KnowledgeItemVersionResponse>> {
    const entities = await findPage(
      this.versions,
      { where: { itemId }, sortBy: 'version', direction: 'DESC' },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toVersionResponse(entity));
  }
}
