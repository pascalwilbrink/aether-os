import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  findPage,
  isUniqueViolation,
  mapPage,
  PolisEvents,
  Transactional,
  type Page,
  type PageRequest,
  AccessControl,
} from '@polis/core';
import { OrganizationsService } from '@polis/organizations';

import type { CreateProjectRequest } from './dto/create-project.request.js';
import type { ProjectResponse } from './dto/project.response.js';
import { nextProjectStatus } from './project-transitions.js';
import { ProjectEntity } from './project.entity.js';
import {
  ProjectArchivedError,
  ProjectSlugTakenError,
} from './project.errors.js';
import { ProjectMapper } from './project.mapper.js';

/**
 * Reads require the organization to exist (404 otherwise); writes also
 * require it to be active (`ORGANIZATION_SUSPENDED` otherwise).
 */
@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    private readonly mapper: ProjectMapper,
    private readonly organizations: OrganizationsService,
    private readonly events: PolisEvents,
    private readonly access: AccessControl,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    dto: CreateProjectRequest,
  ): Promise<ProjectResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);

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
      payload: { projectId: entity.id },
    });

    return this.mapper.toResponse(entity);
  }

  async list(
    organizationId: string,
    page: PageRequest,
  ): Promise<Page<ProjectResponse>> {
    await this.organizations.assertExists(organizationId);

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
            ? { organizationId }
            : { organizationId, id: readable },
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
