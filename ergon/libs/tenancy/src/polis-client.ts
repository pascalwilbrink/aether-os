export interface OrganizationState {
  id: string;
  status: 'active' | 'suspended';
  version: number;
}

export interface ProjectState {
  id: string;
  organizationId: string;
  status: 'active' | 'archived';
  version: number;
}

/**
 * Polis, as Ergon needs it: the current state of one organization or
 * project, or null if Polis doesn't know it. Throws `PolisUnavailableError`
 * when Polis can't be reached. An interface, so tests use a fake.
 */
export abstract class PolisClient {
  abstract getOrganization(
    organizationId: string,
  ): Promise<OrganizationState | null>;

  abstract getProject(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectState | null>;
}
