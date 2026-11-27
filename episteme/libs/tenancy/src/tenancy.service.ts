import { Injectable, NotFoundException } from '@nestjs/common';

import { ValidationProblemException } from '@episteme/core';

import { PolisClient } from './polis-client.js';
import {
  DepartmentArchivedError,
  OrganizationSuspendedError,
  ProjectArchivedError,
} from './tenancy.errors.js';

export interface ScopeRef {
  type: 'department' | 'team' | 'project';
  id: string;
}

/** What owns a resource: a project, a department, or (neither) the organization. */
export interface Owner {
  projectId: string | null;
  departmentId: string | null;
}

/**
 * Organizations and their departments, teams and projects belong to Polis:
 * Episteme asks it, with its own token, before changing anything (no copy
 * of their state yet).
 */
@Injectable()
export class TenancyService {
  constructor(private readonly polis: PolisClient) {}

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
   * The organization's checks, then the owning project or department: an
   * unknown one is a `400` naming the field, an archived one
   * `PROJECT_ARCHIVED` / `DEPARTMENT_ARCHIVED`.
   */
  async assertOwnerAcceptsWrites(
    organizationId: string,
    owner: Owner,
  ): Promise<void> {
    await this.assertOrganizationAcceptsWrites(organizationId);
    if (owner.projectId) {
      const project = await this.polis.getProject(
        organizationId,
        owner.projectId,
      );
      if (project?.organizationId !== organizationId)
        throw unknownOwner('projectId');
      if (project.status === 'archived')
        throw new ProjectArchivedError(owner.projectId);
    }
    if (owner.departmentId) {
      const department = await this.polis.getDepartment(
        organizationId,
        owner.departmentId,
      );
      if (department?.organizationId !== organizationId)
        throw unknownOwner('departmentId');
      if (department.status === 'archived') {
        throw new DepartmentArchivedError(owner.departmentId);
      }
    }
  }

  /**
   * The indexes of the scopes Polis doesn't have as an active department,
   * team or project of the organization (for a validation problem).
   */
  async unknownScopes(
    organizationId: string,
    scopes: readonly ScopeRef[],
  ): Promise<number[]> {
    const unknown: number[] = [];
    for (const [index, scope] of scopes.entries()) {
      const state =
        scope.type === 'department'
          ? await this.polis.getDepartment(organizationId, scope.id)
          : scope.type === 'team'
            ? await this.polis.getTeam(organizationId, scope.id)
            : await this.polis.getProject(organizationId, scope.id);
      if (
        state?.organizationId !== organizationId ||
        state.status !== 'active'
      ) {
        unknown.push(index);
      }
    }
    return unknown;
  }
}

function unknownOwner(
  field: 'projectId' | 'departmentId',
): ValidationProblemException {
  return new ValidationProblemException([
    {
      pointer: `/${field}`,
      parameter: null,
      code: 'INVALID',
      detail: `Not a ${field === 'projectId' ? 'project' : 'department'} of the organization.`,
    },
  ]);
}
