import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  findPage,
  isUniqueViolation,
  mapPage,
  Transactional,
  type Page,
  type PageRequest,
} from '@polis/core';

import type { CreateOrganizationRequest } from './dto/create-organization.request.js';
import type { OrganizationResponse } from './dto/organization.response.js';
import {
  nextOrganizationStatus,
  organizationAcceptsWrites,
  type OrganizationAction,
} from './organization-transitions.js';
import { OrganizationEntity } from './organization.entity.js';
import {
  OrganizationSlugTakenError,
  OrganizationSuspendedError,
} from './organization.errors.js';
import { OrganizationMapper } from './organization.mapper.js';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly organizations: Repository<OrganizationEntity>,
    private readonly mapper: OrganizationMapper,
  ) {}

  @Transactional()
  async create(dto: CreateOrganizationRequest): Promise<OrganizationResponse> {
    const entity = this.mapper.toEntity(dto, new Date());
    try {
      await this.organizations.insert(entity);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new OrganizationSlugTakenError(dto.slug);
      }
      throw error;
    }

    return this.mapper.toResponse(entity);
  }

  async list(page: PageRequest): Promise<Page<OrganizationResponse>> {
    const entities = await findPage(
      this.organizations,
      { where: {}, sortBy: 'createdAt', direction: 'DESC' },
      page,
    );

    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async findById(id: string): Promise<OrganizationResponse> {
    return this.mapper.toResponse(await this.load(id));
  }

  async findBySlug(slug: string): Promise<OrganizationResponse> {
    const entity = await this.organizations.findOneBy({ slug });
    if (!entity) {
      throw new NotFoundException(`Organization "${slug}" not found`);
    }

    return this.mapper.toResponse(entity);
  }

  suspend(id: string): Promise<OrganizationResponse> {
    return this.apply(id, 'suspend');
  }

  activate(id: string): Promise<OrganizationResponse> {
    return this.apply(id, 'activate');
  }

  /** For reads of an organization's resources: 404 unless it exists. */
  async assertExists(id: string): Promise<void> {
    if (!(await this.organizations.existsBy({ id }))) {
      throw this.notFound(id);
    }
  }

  /**
   * For writes to an organization's resources: 404 unless it exists, and
   * `ORGANIZATION_SUSPENDED` unless it's active. Holds a shared lock until the
   * caller's transaction ends, so the organization can't be suspended halfway
   * through the write.
   */
  @Transactional()
  async assertAcceptsWrites(id: string): Promise<void> {
    const entity = await this.organizations.findOne({
      where: { id },
      lock: { mode: 'pessimistic_read' },
    });
    if (!entity) {
      throw this.notFound(id);
    }
    if (!organizationAcceptsWrites(entity.status)) {
      throw new OrganizationSuspendedError(id);
    }
  }

  @Transactional()
  private async apply(
    id: string,
    action: OrganizationAction,
  ): Promise<OrganizationResponse> {
    const entity = await this.load(id, true);
    const next = nextOrganizationStatus(entity.status, action);
    if (next !== entity.status) {
      entity.status = next;
      entity.updatedAt = new Date();
      await this.organizations.save(entity);
    }

    return this.mapper.toResponse(entity);
  }

  private async load(
    id: string,
    forUpdate = false,
  ): Promise<OrganizationEntity> {
    const entity = await this.organizations.findOne({
      where: { id },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw this.notFound(id);
    }

    return entity;
  }

  private notFound(id: string): NotFoundException {
    return new NotFoundException(`Organization ${id} not found`);
  }
}
