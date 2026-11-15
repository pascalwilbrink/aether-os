import type { OrganizationRole, PolisDirectory } from '@pistis/oidc';

/** Polis as Pistis sees it, set up by each test. */
export class FakePolisDirectory implements PolisDirectory {
  private readonly organizations = new Map<string, 'active' | 'suspended'>();
  private readonly memberships = new Map<string, OrganizationRole[]>();

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
