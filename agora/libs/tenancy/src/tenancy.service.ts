import { Injectable, NotFoundException } from '@nestjs/common';

import { PolisClient } from './polis-client.js';
import { OrganizationSuspendedError } from './tenancy.errors.js';

/**
 * Organizations belong to Polis: Agora asks it, with its own token,
 * before changing anything (no copy of their state; the writes here are
 * rare: people managing agents).
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
}
