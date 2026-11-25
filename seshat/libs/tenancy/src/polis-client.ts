export interface OrganizationState {
  id: string;
  status: 'active' | 'suspended';
  version: number;
}

export interface ProjectState {
  id: string;
  organizationId: string;
  status: 'active' | 'archived';
  /** The department it's in, if any. */
  departmentId: string | null;
  version: number;
}

export interface DepartmentState {
  id: string;
  organizationId: string;
  status: 'active' | 'archived';
}

/**
 * Polis, as Seshat needs it: the current state of one organization,
 * project or department, or null if Polis doesn't know it. Throws `PolisUnavailableError`
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

  abstract getDepartment(
    organizationId: string,
    departmentId: string,
  ): Promise<DepartmentState | null>;
}
