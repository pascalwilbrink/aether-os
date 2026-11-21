import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { Transactional } from '@hephaestus/core';

import type { CouncilVersion } from './council-version.js';

import { CouncilVersionEntity } from './council-version.entity.js';

/**
 * Hephaestus's copy of Agora's council versions, stored whole as Agora
 * published them; `CouncilsService` keeps them from Agora's events.
 */
@Injectable()
export class CouncilVersionsService {
  constructor(
    @InjectRepository(CouncilVersionEntity)
    private readonly versions: Repository<CouncilVersionEntity>,
  ) {}

  /** A version of the organization's council; 404 otherwise. */
  async findById(
    organizationId: string,
    versionId: string,
  ): Promise<CouncilVersion> {
    const entity = await this.versions.findOneBy({
      id: versionId,
      organizationId,
    });
    if (!entity) {
      throw new NotFoundException(`Council version ${versionId} not found`);
    }
    return entity.content;
  }

  /** Stores a published version; one already stored keeps its row. */
  @Transactional()
  async store(
    version: CouncilVersion,
    status: CouncilVersionEntity['status'],
  ): Promise<void> {
    const entity = Object.assign(new CouncilVersionEntity(), {
      id: version.id,
      councilId: version.councilId,
      organizationId: version.organizationId,
      number: version.version,
      status,
      content: { ...version, status },
      publishedAt: new Date(version.publishedAt ?? version.createdAt),
    } satisfies CouncilVersionEntity);
    await this.versions
      .createQueryBuilder()
      .insert()
      .values(entity as never)
      .orIgnore()
      .execute();
  }

  @Transactional()
  async deprecate(versionId: string): Promise<void> {
    const entity = await this.versions.findOneBy({ id: versionId });
    if (entity && entity.status !== 'deprecated') {
      entity.status = 'deprecated';
      entity.content = { ...entity.content, status: 'deprecated' };
      await this.versions.save(entity);
    }
  }
}
