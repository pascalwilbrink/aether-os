import { randomUUID } from 'node:crypto';

import type {
  OrganizationState,
  PolisClient,
  ProjectState,
} from '@seshat/tenancy';

/** Polis as Seshat sees it, set up by each test. */
export class FakePolis implements PolisClient {
  readonly organizations = new Map<string, OrganizationState>();
  readonly projects = new Map<string, ProjectState>();

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
