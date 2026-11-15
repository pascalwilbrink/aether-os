import { Injectable } from '@nestjs/common';
import type { Repository } from 'typeorm';

import {
  findPage,
  mapPage,
  TypeOrmTransactionManager,
  isUniqueViolation,
  type OrganizationId,
  type Page,
  type PageRequest,
} from '@polis/core';

import { OrganizationSlugTakenError } from '../../../domain/error/organization-slug-taken.error.js';
import type { Organization } from '../../../domain/organization.js';
import { OrganizationRepository } from '../../../domain/repository/organization.repository.js';
import { OrganizationEntity } from '../entity/organization.entity.js';
import { OrganizationMapper } from '../mapper/organization.mapper.js';

@Injectable()
export class TypeOrmOrganizationRepository extends OrganizationRepository {
  constructor(
    private readonly transactions: TypeOrmTransactionManager,
    private readonly mapper: OrganizationMapper,
  ) {
    super();
  }

  // Resolved per call so writes join the active transaction, if any.
  private get repository(): Repository<OrganizationEntity> {
    return this.transactions.getRepository(OrganizationEntity);
  }

  async save(organization: Organization): Promise<void> {
    try {
      await this.repository.save(this.mapper.toEntity(organization));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new OrganizationSlugTakenError(organization.slug);
      }

      throw error;
    }
  }

  async findById(id: OrganizationId): Promise<Organization | null> {
    const entity = await this.repository.findOneBy({ id });

    return entity ? this.mapper.toDomain(entity) : null;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const entity = await this.repository.findOneBy({ slug });

    return entity ? this.mapper.toDomain(entity) : null;
  }

  async findAll(page: PageRequest): Promise<Page<Organization>> {
    const entities = await findPage(
      this.repository,
      { where: {}, sortBy: 'createdAt', direction: 'DESC' },
      page,
    );

    return mapPage(entities, (entity) => this.mapper.toDomain(entity));
  }
}
