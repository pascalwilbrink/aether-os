import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  type DomainEvent,
  OnDomainEvent,
  type PolisEvents,
} from '@seshat/core';

import { PolisClient } from './polis-client.js';
import { ProjectDepartmentEntity } from './project-department.entity.js';
import {
  DepartmentArchivedError,
  OrganizationSuspendedError,
  PolisUnavailableError,
  ProjectArchivedError,
} from './tenancy.errors.js';

type Payloads = PolisEvents.PolisEventPayloads;

/**
 * Organizations, projects and departments belong to Polis: Seshat asks it
 * before changing anything (writes are rare: people managing knowledge).
 * It keeps one copy: the department each project is in, from Polis's
 * events, so reading a project's knowledge (with its department's) doesn't
 * call Polis every time.
 */
@Injectable()
export class TenancyService {
  private readonly logger = new Logger(TenancyService.name);

  constructor(
    private readonly polis: PolisClient,
    @InjectRepository(ProjectDepartmentEntity)
    private readonly departments: Repository<ProjectDepartmentEntity>,
  ) {}

  /** 404 for an unknown organization, `ORGANIZATION_SUSPENDED` for a suspended one. */
  async assertOrganizationAcceptsWrites(organizationId: string): Promise<void> {
    const organization = await this.polis.getOrganization(organizationId);
    if (!organization) {
      throw new NotFoundException(`Organization ${organizationId} not found`);
    }
    if (organization.status === 'suspended') {
      throw new OrganizationSuspendedError(organizationId);
    }
  }

  /**
   * The organization's checks, then 404 for an unknown project and
   * `PROJECT_ARCHIVED`. Returns the department the project is in (recorded
   * as Polis says it now).
   */
  async assertProjectAcceptsWrites(
    organizationId: string,
    projectId: string,
  ): Promise<{ departmentId: string | null }> {
    await this.assertOrganizationAcceptsWrites(organizationId);
    const project = await this.polis.getProject(organizationId, projectId);
    if (!project || project.organizationId !== organizationId) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
    if (project.status === 'archived') {
      throw new ProjectArchivedError(projectId);
    }
    await this.record(
      organizationId,
      projectId,
      project.departmentId,
      project.version,
    );
    return { departmentId: project.departmentId };
  }

  /** The organization's checks, then 404 for an unknown department and `DEPARTMENT_ARCHIVED`. */
  async assertDepartmentAcceptsWrites(
    organizationId: string,
    departmentId: string,
  ): Promise<void> {
    await this.assertOrganizationAcceptsWrites(organizationId);
    const department = await this.polis.getDepartment(
      organizationId,
      departmentId,
    );
    if (!department || department.organizationId !== organizationId) {
      throw new NotFoundException(`Department ${departmentId} not found`);
    }
    if (department.status === 'archived') {
      throw new DepartmentArchivedError(departmentId);
    }
  }

  /**
   * The department a project is in, for reading its knowledge: from the
   * copy, else from Polis (then recorded). When Polis can't be asked, the
   * project reads its own knowledge only (null), rather than failing.
   */
  async departmentOf(
    organizationId: string,
    projectId: string,
  ): Promise<string | null> {
    const known = await this.departments.findOneBy({ projectId });
    if (known) {
      return known.organizationId === organizationId
        ? known.departmentId
        : null;
    }
    let project;
    try {
      project = await this.polis.getProject(organizationId, projectId);
    } catch (error) {
      if (error instanceof PolisUnavailableError) {
        this.logger.warn(
          `Reading project ${projectId}'s knowledge without its department's: ${error.message}`,
        );
        return null;
      }
      throw error;
    }
    if (!project || project.organizationId !== organizationId) {
      return null;
    }
    await this.record(
      organizationId,
      projectId,
      project.departmentId,
      project.version,
    );
    return project.departmentId;
  }

  @OnDomainEvent('polis.project.created')
  async onProjectCreated(
    event: DomainEvent<Payloads['project.created']>,
  ): Promise<void> {
    if (!event.organizationId) return;
    await this.record(
      event.organizationId,
      event.payload.projectId,
      event.payload.departmentId,
      event.aggregateVersion,
    );
  }

  @OnDomainEvent('polis.project.department-changed')
  async onProjectDepartmentChanged(
    event: DomainEvent<Payloads['project.department-changed']>,
  ): Promise<void> {
    if (!event.organizationId) return;
    await this.record(
      event.organizationId,
      event.payload.projectId,
      event.payload.to,
      event.aggregateVersion,
    );
  }

  /** Records a project's department, unless what's recorded is as new or newer. */
  private async record(
    organizationId: string,
    projectId: string,
    departmentId: string | null,
    version: number,
  ): Promise<void> {
    await this.departments.query(
      `INSERT INTO project_departments
         (project_id, organization_id, department_id, version, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (project_id) DO UPDATE
         SET department_id = EXCLUDED.department_id,
             version = EXCLUDED.version,
             updated_at = EXCLUDED.updated_at
         WHERE project_departments.version < EXCLUDED.version`,
      [projectId, organizationId, departmentId, version],
    );
  }
}
