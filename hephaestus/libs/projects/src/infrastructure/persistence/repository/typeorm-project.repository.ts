import { Injectable } from '@nestjs/common';
import type { Repository } from 'typeorm';

import {
  TypeOrmTransactionManager,
  isUniqueViolation,
  type OrganizationId,
  type Page,
  type PageRequest,
  type ProjectId,
} from '@hephaestus/core';

import { ProjectSlugTakenError } from '../../../domain/error/project-slug-taken.error.js';
import type { Project } from '../../../domain/project.js';
import { ProjectRepository } from '../../../domain/repository/project.repository.js';
import { ProjectEntity } from '../entity/project.entity.js';
import { ProjectMapper } from '../mapper/project.mapper.js';

@Injectable()
export class TypeOrmProjectRepository extends ProjectRepository {
  constructor(
    private readonly transactions: TypeOrmTransactionManager,
    private readonly mapper: ProjectMapper,
  ) {
    super();
  }

  // Resolved per call so writes join the active transaction, if any.
  private get repository(): Repository<ProjectEntity> {
    return this.transactions.getRepository(ProjectEntity);
  }

  async save(project: Project): Promise<void> {
    try {
      await this.repository.save(this.mapper.toEntity(project));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProjectSlugTakenError(project.slug);
      }

      throw error;
    }
  }

  async findById(
    organizationId: OrganizationId,
    projectId: ProjectId,
  ): Promise<Project | null> {
    const entity = await this.repository.findOneBy({
      id: projectId,
      organizationId,
    });

    return entity ? this.mapper.toDomain(entity) : null;
  }

  async findByOrganization(
    organizationId: OrganizationId,
    { limit, offset }: PageRequest,
  ): Promise<Page<Project>> {
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
