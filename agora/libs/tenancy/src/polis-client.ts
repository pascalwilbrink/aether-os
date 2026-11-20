export interface OrganizationState {
  id: string;
  status: 'active' | 'suspended';
  version: number;
}

/**
 * Polis, as Agora needs it: the current state of one organization, or null if Polis doesn't know it. Throws `PolisUnavailableError`
 * when Polis can't be reached. An interface, so tests use a fake.
 */
export abstract class PolisClient {
  abstract getOrganization(
    organizationId: string,
  ): Promise<OrganizationState | null>;
}
