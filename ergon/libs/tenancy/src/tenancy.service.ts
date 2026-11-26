import { Injectable, NotFoundException } from '@nestjs/common';

import { PolisClient } from './polis-client.js';
import {
  OrganizationSuspendedError,
  ProjectArchivedError,
} from './tenancy.errors.js';

/**
 * Organizations and projects belong to Polis: Ergon asks it, with its
 * own token, before changing anything (no copy of their state yet; the
 * writes are people and agents changing work).
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

  /** The organization's checks, then 404 for an unknown project and `PROJECT_ARCHIVED`. */
  async assertProjectAcceptsWrites(
    organizationId: string,
    projectId: string,
  ): Promise<void> {
    await this.assertOrganizationAcceptsWrites(organizationId);
    const project = await this.polis.getProject(organizationId, projectId);
    if (!project || project.organizationId !== organizationId) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
    if (project.status === 'archived') {
      throw new ProjectArchivedError(projectId);
    }
  }
}
