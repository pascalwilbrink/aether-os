import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  findPage,
  isUniqueViolation,
  mapPage,
  OnDomainEvent,
  PolisEvents,
  Transactional,
  type DomainEvent,
  type Page,
  type PageRequest,
  type PolisEventPayloads,
  AccessControl,
} from '@polis/core';
import {
  DepartmentHasProjectsError,
  DepartmentsService,
} from '@polis/departments';
import { OrganizationsService } from '@polis/organizations';

import type { CreateProjectRequest } from './dto/create-project.request.js';
import type { ProjectResponse } from './dto/project.response.js';
import type { SetProjectDepartmentRequest } from './dto/set-project-department.request.js';
import { nextProjectStatus } from './project-transitions.js';
import { ProjectEntity } from './project.entity.js';
import {
  ProjectArchivedError,
  ProjectSlugTakenError,
} from './project.errors.js';
import { ProjectMapper } from './project.mapper.js';

/**
 * Reads require the organization to exist (404 otherwise); writes also
 * require it to be active (`ORGANIZATION_SUSPENDED` otherwise). A project is
 * in at most one of the organization's departments, which must be active
 * when it's put there (`DEPARTMENT_ARCHIVED`); a department with active
 * projects can't be archived (`DEPARTMENT_HAS_PROJECTS`).
 */
@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    private readonly mapper: ProjectMapper,
    private readonly organizations: OrganizationsService,
    private readonly departments: DepartmentsService,
    private readonly events: PolisEvents,
    private readonly access: AccessControl,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    dto: CreateProjectRequest,
  ): Promise<ProjectResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);
    if (dto.departmentId) {
      await this.departments.assertActive(organizationId, dto.departmentId);
    }

    const entity = this.mapper.toEntity(
      dto,
      organizationId,
      this.access.principal().sub,
      new Date(),
    );
    try {
      await this.projects.insert(entity);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProjectSlugTakenError(dto.slug);
      }
      throw error;
    }
    await this.events.emit({
      eventType: 'project.created',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId,
      projectId: entity.id,
      payload: { projectId: entity.id, departmentId: entity.departmentId },
    });

    return this.mapper.toResponse(entity);
  }

  async list(
    organizationId: string,
    query: PageRequest & { departmentId?: string },
  ): Promise<Page<ProjectResponse>> {
    await this.organizations.assertExists(organizationId);
    const { departmentId, ...page } = query;
    const inDepartment = departmentId ? { departmentId } : {};

    // Only the projects the caller may read (docs/identity.md: no access
    // by default; organization owners and admins see all).
    const readable = this.access.readableProjects();
    if (readable !== 'all' && readable.length === 0) {
      return { items: [], nextCursor: null };
    }
    const entities = await findPage(
      this.projects,
      {
        where:
          readable === 'all'
            ? { organizationId, ...inDepartment }
            : { organizationId, ...inDepartment, id: readable },
        sortBy: 'createdAt',
        direction: 'DESC',
      },
      page,
    );

    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async findById(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectResponse> {
    await this.organizations.assertExists(organizationId);

    return this.mapper.toResponse(await this.load(organizationId, projectId));
  }

  @Transactional()
  async archive(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);

    const entity = await this.load(organizationId, projectId, true);
    const next = nextProjectStatus(entity.status, 'archive');
    if (next !== entity.status) {
      entity.status = next;
      entity.updatedAt = new Date();
      entity.version += 1;
      await this.projects.save(entity);
      await this.events.emit({
        eventType: 'project.archived',
        aggregateId: entity.id,
        aggregateVersion: entity.version,
        organizationId,
        projectId: entity.id,
        payload: { projectId: entity.id },
      });
    }

    return this.mapper.toResponse(entity);
  }

  /**
   * Moves the project into a department, or out of one (`null`); the
   * project must be active. Unchanged → no new version, no event.
   */
  @Transactional()
  async setDepartment(
    organizationId: string,
    projectId: string,
    dto: SetProjectDepartmentRequest,
  ): Promise<ProjectResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);
    const entity = await this.load(organizationId, projectId, true);
    if (entity.status !== 'active') {
      throw new ProjectArchivedError(projectId);
    }
    const to = dto.departmentId;
    if (to === entity.departmentId) {
      return this.mapper.toResponse(entity);
    }
    if (to) {
      await this.departments.assertActive(organizationId, to);
    }
    const from = entity.departmentId;
    entity.departmentId = to;
    entity.updatedAt = new Date();
    entity.version += 1;
    await this.projects.save(entity);
    await this.events.emit({
      eventType: 'project.department-changed',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId,
      projectId: entity.id,
      payload: { projectId: entity.id, from, to },
    });

    return this.mapper.toResponse(entity);
  }

  /**
   * A department with active projects stays: refused in the archiving's
   * transaction (it locked the department, so no project can join it now).
   */
  @OnDomainEvent('polis.department.archived')
  async onDepartmentArchived(
    event: DomainEvent<PolisEventPayloads['department.archived']>,
  ): Promise<void> {
    const { departmentId } = event.payload;
    const count = await this.projects.countBy({
      departmentId,
      status: 'active',
    });
    if (count > 0) {
      throw new DepartmentHasProjectsError(departmentId, count);
    }
  }

  /**
   * For writes to a project's resources (its memberships): 404 unless it
   * exists in the organization, `ORGANIZATION_SUSPENDED` or
   * `PROJECT_ARCHIVED` unless both are active. Locks the project row (shared)
   * until the transaction ends, so it can't be archived halfway through.
   */
  @Transactional()
  async assertActive(organizationId: string, projectId: string): Promise<void> {
    await this.organizations.assertAcceptsWrites(organizationId);
    const entity = await this.projects.findOne({
      where: { id: projectId, organizationId },
      lock: { mode: 'pessimistic_read' },
    });
    if (!entity) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
    if (entity.status !== 'active') {
      throw new ProjectArchivedError(projectId);
    }
  }

  /** For reads of a project's resources: 404 unless it exists. */
  async assertExists(organizationId: string, projectId: string): Promise<void> {
    await this.organizations.assertExists(organizationId);
    if (!(await this.projects.existsBy({ id: projectId, organizationId }))) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
  }

  /** Scoped to the organization: another organization's project is a 404. */
  private async load(
    organizationId: string,
    projectId: string,
    forUpdate = false,
  ): Promise<ProjectEntity> {
    const entity = await this.projects.findOne({
      where: { id: projectId, organizationId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    return entity;
  }
}
