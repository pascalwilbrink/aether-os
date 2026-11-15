export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';

/**
 * What Pistis asks Polis when issuing organization tokens: a user's roles in
 * an organization, and whether the organization is active. An interface, so
 * tests use a fake.
 */
export abstract class PolisDirectory {
  /** The user's roles in the organization, or null if they're not a member. */
  abstract membershipRoles(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationRole[] | null>;

  /** The organization's status, or null if it doesn't exist. */
  abstract organizationStatus(
    organizationId: string,
  ): Promise<'active' | 'suspended' | null>;
}
