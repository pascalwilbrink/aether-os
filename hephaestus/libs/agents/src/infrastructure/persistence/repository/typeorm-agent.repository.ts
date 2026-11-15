import { Injectable } from '@nestjs/common';
import type { Repository } from 'typeorm';

import {
  findPage,
  mapPage,
  TypeOrmTransactionManager,
  type AgentId,
  type OrganizationId,
  type Page,
  type PageRequest,
} from '@hephaestus/core';

import type { Agent } from '../../../domain/agent.js';
import { AgentRepository } from '../../../domain/repository/agent.repository.js';
import { AgentEntity } from '../entity/agent.entity.js';
import { AgentMapper } from '../mapper/agent.mapper.js';

@Injectable()
export class TypeOrmAgentRepository extends AgentRepository {
  constructor(
    private readonly transactions: TypeOrmTransactionManager,
    private readonly mapper: AgentMapper,
  ) {
    super();
  }

  // Resolved per call so writes join the active transaction, if any.
  private get repository(): Repository<AgentEntity> {
    return this.transactions.getRepository(AgentEntity);
  }

  async save(agent: Agent): Promise<void> {
    await this.repository.save(this.mapper.toEntity(agent));
  }

  async findById(
    organizationId: OrganizationId,
    agentId: AgentId,
  ): Promise<Agent | null> {
    const entity = await this.repository.findOneBy({
      id: agentId,
      organizationId,
    });

    return entity ? this.mapper.toDomain(entity) : null;
  }

  async findByOrganization(
    organizationId: OrganizationId,
    page: PageRequest,
  ): Promise<Page<Agent>> {
    const entities = await findPage(
      this.repository,
      { where: { organizationId }, sortBy: 'createdAt', direction: 'DESC' },
      page,
    );

    return mapPage(entities, (entity) => this.mapper.toDomain(entity));
  }
}
