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
import { OrganizationsService } from '@polis/organizations';

import type { CreateProjectRequest } from './dto/create-project.request.js';
import type { ProjectResponse } from './dto/project.response.js';
import { nextProjectStatus } from './project-transitions.js';
import { ProjectEntity } from './project.entity.js';
import { ProjectSlugTakenError } from './project.errors.js';
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
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    dto: CreateProjectRequest,
  ): Promise<ProjectResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);

    const entity = this.mapper.toEntity(dto, organizationId, new Date());
    try {
      await this.projects.insert(entity);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProjectSlugTakenError(dto.slug);
      }
      throw error;
    }

    return this.mapper.toResponse(entity);
  }

  async list(
    organizationId: string,
    page: PageRequest,
  ): Promise<Page<ProjectResponse>> {
    await this.organizations.assertExists(organizationId);

    const entities = await findPage(
      this.projects,
      { where: { organizationId }, sortBy: 'createdAt', direction: 'DESC' },
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
      await this.projects.save(entity);
    }

    return this.mapper.toResponse(entity);
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
