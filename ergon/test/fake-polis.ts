import { randomUUID } from 'node:crypto';

import type {
  GroupState,
  OrganizationState,
  PolisClient,
  ProjectState,
} from '@ergon/tenancy';

/** Polis as Ergon sees it, set up by each test. */
export class FakePolis implements PolisClient {
  readonly organizations = new Map<string, OrganizationState>();
  readonly projects = new Map<string, ProjectState>();
  readonly departments = new Map<string, GroupState>();
  readonly teams = new Map<string, GroupState>();

  department(
    organizationId: string,
    status: GroupState['status'] = 'active',
  ): string {
    const id = randomUUID();
    this.departments.set(id, { id, organizationId, status });
    return id;
  }

  team(
    organizationId: string,
    status: GroupState['status'] = 'active',
  ): string {
    const id = randomUUID();
    this.teams.set(id, { id, organizationId, status });
    return id;
  }

  getDepartment(
    organizationId: string,
    departmentId: string,
  ): Promise<GroupState | null> {
    const found = this.departments.get(departmentId);
    return Promise.resolve(
      found?.organizationId === organizationId ? found : null,
    );
  }

  getTeam(organizationId: string, teamId: string): Promise<GroupState | null> {
    const found = this.teams.get(teamId);
    return Promise.resolve(
      found?.organizationId === organizationId ? found : null,
    );
  }

  organization(status: OrganizationState['status'] = 'active'): string {
    const id = randomUUID();
    this.organizations.set(id, { id, status, version: 1 });
    return id;
  }

  project(
    organizationId: string,
    status: ProjectState['status'] = 'active',
  ): string {
    const id = randomUUID();
    this.projects.set(id, { id, organizationId, status, version: 1 });
    return id;
  }

  getOrganization(organizationId: string): Promise<OrganizationState | null> {
    return Promise.resolve(this.organizations.get(organizationId) ?? null);
  }

  getProject(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectState | null> {
    const project = this.projects.get(projectId);
    return Promise.resolve(
      project?.organizationId === organizationId ? project : null,
    );
  }
}
