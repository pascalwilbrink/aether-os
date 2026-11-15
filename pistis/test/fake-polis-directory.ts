import type {
  OrganizationRole,
  PolisDirectory,
  ProjectRole,
} from '@pistis/oidc';

/** Polis as Pistis sees it, set up by each test. */
export class FakePolisDirectory implements PolisDirectory {
  private readonly organizations = new Map<string, 'active' | 'suspended'>();
  private readonly memberships = new Map<string, OrganizationRole[]>();
  private readonly grants = new Map<string, Record<string, ProjectRole>>();

  addOrganization(id: string, status: 'active' | 'suspended' = 'active'): this {
    this.organizations.set(id, status);
    return this;
  }

  addMember(
    userId: string,
    organizationId: string,
    roles: OrganizationRole[],
  ): this {
    this.memberships.set(`${userId}/${organizationId}`, roles);
    return this;
  }

  grantProject(
    userId: string,
    organizationId: string,
    projectId: string,
    role: ProjectRole,
  ): this {
    const key = `${userId}/${organizationId}`;
    this.grants.set(key, { ...this.grants.get(key), [projectId]: role });
    return this;
  }

  projectRoles(
    userId: string,
    organizationId: string,
  ): Promise<Record<string, ProjectRole>> {
    return Promise.resolve(
      this.grants.get(`${userId}/${organizationId}`) ?? {},
    );
  }

  removeMember(userId: string, organizationId: string): this {
    this.memberships.delete(`${userId}/${organizationId}`);
    return this;
  }

  membershipRoles(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationRole[] | null> {
    return Promise.resolve(
      this.memberships.get(`${userId}/${organizationId}`) ?? null,
    );
  }

  organizationStatus(
    organizationId: string,
  ): Promise<'active' | 'suspended' | null> {
    return Promise.resolve(this.organizations.get(organizationId) ?? null);
  }
}
