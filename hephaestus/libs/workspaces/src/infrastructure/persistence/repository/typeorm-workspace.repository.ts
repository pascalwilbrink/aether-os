import { Injectable } from '@nestjs/common';
import type { Repository } from 'typeorm';

import {
  TypeOrmTransactionManager,
  type OrganizationId,
  type Page,
  type PageRequest,
  type WorkspaceId,
} from '@hephaestus/core';

import { WorkspaceRepository } from '../../../domain/repository/workspace.repository.js';
import type { Workspace } from '../../../domain/workspace.js';
import { WorkspaceEntity } from '../entity/workspace.entity.js';
import { WorkspaceMapper } from '../mapper/workspace.mapper.js';

@Injectable()
export class TypeOrmWorkspaceRepository extends WorkspaceRepository {
  constructor(
    private readonly transactions: TypeOrmTransactionManager,
    private readonly mapper: WorkspaceMapper,
  ) {
    super();
  }

  // Resolved per call so writes join the active transaction, if any.
  private get repository(): Repository<WorkspaceEntity> {
    return this.transactions.getRepository(WorkspaceEntity);
  }

  async save(workspace: Workspace): Promise<void> {
    await this.repository.save(this.mapper.toEntity(workspace));
  }

  async findById(
    organizationId: OrganizationId,
    workspaceId: WorkspaceId,
  ): Promise<Workspace | null> {
    const entity = await this.repository.findOneBy({
      id: workspaceId,
      organizationId,
    });

    return entity ? this.mapper.toDomain(entity) : null;
  }

  async findByOrganization(
    organizationId: OrganizationId,
    { limit, offset }: PageRequest,
  ): Promise<Page<Workspace>> {
    const [entities, total] = await this.repository.findAndCount({
      where: { organizationId },
      order: { createdAt: 'DESC', id: 'ASC' },
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
}
