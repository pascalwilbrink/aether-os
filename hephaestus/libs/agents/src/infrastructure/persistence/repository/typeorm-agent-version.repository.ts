import { Injectable } from '@nestjs/common';
import type { Repository } from 'typeorm';

import {
  TypeOrmTransactionManager,
  isUniqueViolation,
  type AgentId,
  type AgentVersionId,
  type OrganizationId,
  type Page,
  type PageRequest,
} from '@hephaestus/core';

import type { AgentVersion } from '../../../domain/agent-version.js';
import { AgentVersionConflictError } from '../../../domain/error/agent-version-conflict.error.js';
import { AgentVersionRepository } from '../../../domain/repository/agent-version.repository.js';
import { AgentVersionEntity } from '../entity/agent-version.entity.js';
import { AgentVersionMapper } from '../mapper/agent-version.mapper.js';

@Injectable()
export class TypeOrmAgentVersionRepository extends AgentVersionRepository {
  constructor(
    private readonly transactions: TypeOrmTransactionManager,
    private readonly mapper: AgentVersionMapper,
  ) {
    super();
  }

  // Resolved per call so writes join the active transaction, if any.
  private get repository(): Repository<AgentVersionEntity> {
    return this.transactions.getRepository(AgentVersionEntity);
  }

  async save(version: AgentVersion): Promise<void> {
    try {
      await this.repository.save(this.mapper.toEntity(version));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AgentVersionConflictError(version.agentId, version.version);
      }

      throw error;
    }
  }

  async findById(
    organizationId: OrganizationId,
    versionId: AgentVersionId,
  ): Promise<AgentVersion | null> {
    const entity = await this.repository.findOneBy({
      id: versionId,
      organizationId,
    });

    return entity ? this.mapper.toDomain(entity) : null;
  }

  async findByAgent(
    organizationId: OrganizationId,
    agentId: AgentId,
    { limit, offset }: PageRequest,
  ): Promise<Page<AgentVersion>> {
    const [entities, total] = await this.repository.findAndCount({
      where: { organizationId, agentId },
      order: { version: 'DESC' },
      take: limit,
      skip: offset,
    });

    return {
      items: entities.map((entity) => this.mapper.toDomain(entity)),
      total,
      limit,
      offset,
    };
  }

  async getNextVersionNumber(
    organizationId: OrganizationId,
    agentId: AgentId,
  ): Promise<number> {
    const current = await this.repository.maximum('version', {
      organizationId,
      agentId,
    });

    return (current ?? 0) + 1;
  }
}
