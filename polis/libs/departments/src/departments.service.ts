import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  AccessControl,
  findPage,
  isUniqueViolation,
  mapPage,
  PolisEvents,
  Transactional,
  type Page,
  type PageRequest,
} from '@polis/core';
import { OrganizationsService } from '@polis/organizations';

import type { CreateDepartmentRequest } from './dto/create-department.request.js';
import type { DepartmentResponse } from './dto/department.response.js';
import type { UpdateDepartmentRequest } from './dto/update-department.request.js';
import { DepartmentEntity } from './department.entity.js';
import {
  DepartmentArchivedError,
  DepartmentSlugTakenError,
} from './department.errors.js';
import { DepartmentMapper } from './department.mapper.js';
import type { DepartmentStatus } from './department.types.js';

/**
 * An organization's optional departments. Reads require the organization to
 * exist (404); writes also require it to be active (`ORGANIZATION_SUSPENDED`).
 * Archiving is final, and refused while an active project is in the
 * department: Polis's projects check that on the local `department.archived`
 * event, in the same transaction (`DEPARTMENT_HAS_PROJECTS`).
 */
@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(DepartmentEntity)
    private readonly departments: Repository<DepartmentEntity>,
    private readonly mapper: DepartmentMapper,
    private readonly organizations: OrganizationsService,
    private readonly events: PolisEvents,
    private readonly access: AccessControl,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    dto: CreateDepartmentRequest,
  ): Promise<DepartmentResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);

    const entity = this.mapper.toEntity(
      dto,
      organizationId,
      this.access.principal().sub,
      new Date(),
    );
    try {
      await this.departments.insert(entity);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DepartmentSlugTakenError(dto.slug);
      }
      throw error;
    }
    await this.events.emit({
      eventType: 'department.created',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId,
      payload: { departmentId: entity.id, slug: entity.slug },
    });

    return this.mapper.toResponse(entity);
  }

  async list(
    organizationId: string,
    query: PageRequest & { status?: DepartmentStatus },
  ): Promise<Page<DepartmentResponse>> {
    await this.organizations.assertExists(organizationId);
    const { status, ...page } = query;
    const entities = await findPage(
      this.departments,
      {
        where: status ? { organizationId, status } : { organizationId },
        sortBy: 'createdAt',
        direction: 'DESC',
      },
      page,
    );

    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async findById(
    organizationId: string,
    departmentId: string,
  ): Promise<DepartmentResponse> {
    await this.organizations.assertExists(organizationId);
    return this.mapper.toResponse(
      await this.load(organizationId, departmentId),
    );
  }

  /** PUT: the name and description; unchanged → no new version, no event. */
  @Transactional()
  async update(
    organizationId: string,
    departmentId: string,
    dto: UpdateDepartmentRequest,
  ): Promise<DepartmentResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);
    const entity = await this.load(organizationId, departmentId, true);
    if (entity.status !== 'active') {
      throw new DepartmentArchivedError(departmentId);
    }
    if (entity.name === dto.name && entity.description === dto.description) {
      return this.mapper.toResponse(entity);
    }
    entity.name = dto.name;
    entity.description = dto.description;
    entity.updatedAt = new Date();
    entity.version += 1;
    await this.departments.save(entity);
    await this.events.emit({
      eventType: 'department.updated',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId,
      payload: { departmentId: entity.id },
    });

    return this.mapper.toResponse(entity);
  }

  /** Final; idempotent. Its projects' check runs on the emitted event. */
  @Transactional()
  async archive(
    organizationId: string,
    departmentId: string,
  ): Promise<DepartmentResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);
    const entity = await this.load(organizationId, departmentId, true);
    if (entity.status === 'archived') {
      return this.mapper.toResponse(entity);
    }
    entity.status = 'archived';
    entity.updatedAt = new Date();
    entity.version += 1;
    await this.departments.save(entity);
    await this.events.emit({
      eventType: 'department.archived',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId,
      payload: { departmentId: entity.id },
    });

    return this.mapper.toResponse(entity);
  }

  /**
   * For putting something in a department (a project): 404 unless
   * it exists in the organization, `ORGANIZATION_SUSPENDED` or
   * `DEPARTMENT_ARCHIVED` unless both are active. Locks the department row
   * (shared) until the transaction ends, so it can't be archived halfway.
   */
  @Transactional()
  async assertActive(
    organizationId: string,
    departmentId: string,
  ): Promise<void> {
    await this.organizations.assertAcceptsWrites(organizationId);
    const entity = await this.departments.findOne({
      where: { id: departmentId, organizationId },
      lock: { mode: 'pessimistic_read' },
    });
    if (!entity) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }
    if (entity.status !== 'active') {
      throw new DepartmentArchivedError(departmentId);
    }
  }

  /** For reads of a department's resources: 404 unless it exists. */
  async assertExists(
    organizationId: string,
    departmentId: string,
  ): Promise<void> {
    await this.organizations.assertExists(organizationId);
    if (
      !(await this.departments.existsBy({ id: departmentId, organizationId }))
    ) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }
  }

  /** Scoped to the organization: another organization's department is a 404. */
  private async load(
    organizationId: string,
    departmentId: string,
    forUpdate = false,
  ): Promise<DepartmentEntity> {
    const entity = await this.departments.findOne({
      where: { id: departmentId, organizationId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }
    return entity;
  }
}
