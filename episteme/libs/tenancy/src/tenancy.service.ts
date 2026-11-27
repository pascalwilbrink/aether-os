import { Injectable, NotFoundException } from '@nestjs/common';

import { PolisClient } from './polis-client.js';
import { OrganizationSuspendedError } from './tenancy.errors.js';

export interface ScopeRef {
  type: 'department' | 'team' | 'project';
  id: string;
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
