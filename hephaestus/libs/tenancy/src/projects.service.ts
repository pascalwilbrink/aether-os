import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  OnDomainEvent,
  Transactional,
  type DomainEvent,
  type PolisEvents,
} from '@hephaestus/core';

import { OrganizationsService } from './organizations.service.js';
import { PolisClient, type ProjectState } from './polis-client.js';
import { ProjectStateEntity } from './project-state.entity.js';
import { ProjectArchivedError } from './tenancy.errors.js';

/** Projects as Hephaestus sees them: Polis owns them, like organizations. */
@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(ProjectStateEntity)
    private readonly states: Repository<ProjectStateEntity>,
    private readonly polis: PolisClient,
    private readonly organizations: OrganizationsService,
  ) {}

  /**
   * For resources created in a project (workspaces): the organization must
   * accept writes, the project must exist in it (404) and be active
   * (`PROJECT_ARCHIVED`).
   */
  async assertAcceptsWrites(
    organizationId: string,
    projectId: string,
  ): Promise<void> {
    await this.organizations.assertAcceptsWrites(organizationId);

    const state = await this.load(organizationId, projectId);
    if (state.status !== 'active') {
      throw new ProjectArchivedError(projectId);
    }
  }

  @OnDomainEvent('polis.project.created')
  onCreated(event: DomainEvent<PolisEvents.ProjectCreated>): Promise<void> {
    return this.applyEvent(event, 'active');
  }

  @OnDomainEvent('polis.project.archived')
  onArchived(event: DomainEvent<PolisEvents.ProjectArchived>): Promise<void> {
    return this.applyEvent(event, 'archived');
  }

  /** Stores a state unless the stored one is as new or newer. */
  @Transactional()
  async apply(state: ProjectState): Promise<void> {
    await this.states.query(
      `INSERT INTO project_states (id, organization_id, status, version, synced_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status, version = EXCLUDED.version, synced_at = EXCLUDED.synced_at
         WHERE project_states.version < EXCLUDED.version`,
      [state.id, state.organizationId, state.status, state.version],
    );
  }

  private applyEvent(
    event: DomainEvent<{ projectId: string }>,
    status: ProjectState['status'],
  ): Promise<void> {
    if (!event.organizationId) {
      return Promise.resolve();
    }

    return this.apply({
      id: event.payload.projectId,
      organizationId: event.organizationId,
      status,
      version: event.aggregateVersion,
    });
  }

  /** Within the organization: another organization's project is a 404. */
  private async load(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectState> {
    const stored = await this.states.findOneBy({ id: projectId });
    if (stored) {
      if (stored.organizationId !== organizationId) {
        throw this.notFound(projectId);
      }
      return stored;
    }

    const fetched = await this.polis.getProject(organizationId, projectId);
    if (!fetched) {
      throw this.notFound(projectId);
    }
    await this.apply(fetched);

    return fetched;
  }

  private notFound(projectId: string): NotFoundException {
    return new NotFoundException(`Project ${projectId} not found`);
  }
}
