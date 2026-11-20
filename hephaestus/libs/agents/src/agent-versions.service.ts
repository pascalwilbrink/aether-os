import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { type AgentVersion, Transactional } from '@hephaestus/core';

import { AgentVersionEntity } from './agent-version.entity.js';
import { AgentVersionMapper } from './agent-version.mapper.js';

/**
 * Hephaestus's copy of Agora's agent versions: stored as Agora published
 * them (they never change), for tasks to pin and the runner to run.
 * `AgentsService` keeps them from Agora's events.
 */
@Injectable()
export class AgentVersionsService {
  constructor(
    @InjectRepository(AgentVersionEntity)
    private readonly versions: Repository<AgentVersionEntity>,
    private readonly mapper: AgentVersionMapper,
  ) {}

  /** A version of the organization's agent; 404 otherwise. */
  async findById(
    organizationId: string,
    agentId: string,
    versionId: string,
  ): Promise<AgentVersion> {
    const entity = await this.versions.findOneBy({
      id: versionId,
      agentId,
      organizationId,
    });
    if (!entity) {
      throw new NotFoundException(`Agent version ${versionId} not found`);
    }

    return this.mapper.toVersion(entity);
  }

  /**
   * Stores a version Agora published, with the status it has now in the
   * copy; one already stored keeps its row (a repeated or late event).
   */
  @Transactional()
  async store(
    version: AgentVersion,
    status: AgentVersionEntity['status'],
  ): Promise<void> {
    const entity = this.mapper.fromAgora(version);
    entity.status = status;
    await this.versions
      .createQueryBuilder()
      .insert()
      .values(entity)
      .orIgnore()
      .execute();
  }

  /** Marks a version deprecated (it stays runnable for the tasks that pinned it). */
  @Transactional()
  async deprecate(versionId: string): Promise<void> {
    await this.versions.update({ id: versionId }, { status: 'deprecated' });
  }
}
