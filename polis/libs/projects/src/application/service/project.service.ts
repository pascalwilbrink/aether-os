import { Injectable, NotFoundException } from '@nestjs/common';

import type { OrganizationId, Page, PageRequest, ProjectId } from '@polis/core';
import { OrganizationService } from '@polis/organizations';

import { Project, type CreateProjectProps } from '../../domain/project.js';
import { ProjectRepository } from '../../domain/repository/project.repository.js';

export type CreateProjectInput = CreateProjectProps;

/**
 * Reads require the organization to exist (404 otherwise); writes also
 * require it to be active (OrganizationSuspendedError otherwise).
 */
@Injectable()
export class ProjectService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly organizations: OrganizationService,
  ) {}

  async create(input: CreateProjectInput): Promise<Project> {
    await this.organizations.findActiveById(input.organizationId);

    const project = Project.create(input);

    await this.projectRepository.save(project);

    return project;
  }

  async findById(
    organizationId: OrganizationId,
    projectId: ProjectId,
  ): Promise<Project> {
    await this.organizations.findById(organizationId);

    return this.loadProject(organizationId, projectId);
  }

  /**
   * For other modules creating resources under a project: the project
   * must exist (404) and be active (ProjectArchivedError), and its
   * organization must be active (OrganizationSuspendedError).
   */
  async findActiveById(
    organizationId: OrganizationId,
    projectId: ProjectId,
  ): Promise<Project> {
    await this.organizations.findActiveById(organizationId);

    const project = await this.loadProject(organizationId, projectId);

    project.ensureActive();

    return project;
  }

  async list(
    organizationId: OrganizationId,
    page: PageRequest,
  ): Promise<Page<Project>> {
    await this.organizations.findById(organizationId);

    return this.projectRepository.findByOrganization(organizationId, page);
  }

  async archive(
    organizationId: OrganizationId,
    projectId: ProjectId,
  ): Promise<void> {
    await this.organizations.findActiveById(organizationId);

    const project = await this.loadProject(organizationId, projectId);

    project.archive();

    await this.projectRepository.save(project);
  }

  private async loadProject(
    organizationId: OrganizationId,
    projectId: ProjectId,
  ): Promise<Project> {
    const project = await this.projectRepository.findById(
      organizationId,
      projectId,
    );

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }
}
