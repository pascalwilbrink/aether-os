import { randomUUID } from 'node:crypto';

import type { OrganizationState, PolisClient } from '@agora/tenancy';

/** Polis as Agora sees it, set up by each test. */
export class FakePolis implements PolisClient {
  readonly organizations = new Map<string, OrganizationState>();

  organization(status: OrganizationState['status'] = 'active'): string {
    const id = randomUUID();
    this.organizations.set(id, { id, status, version: 1 });
    return id;
  }

  getOrganization(organizationId: string): Promise<OrganizationState | null> {
    return Promise.resolve(this.organizations.get(organizationId) ?? null);
  }
}
