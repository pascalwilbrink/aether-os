export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';
export type ProjectRole = 'approver' | 'editor' | 'viewer';
/** A user (the default) or a service account. */
export type SubjectType = 'user' | 'service_account';

/**
 * What Pistis asks Polis when issuing organization tokens: a user's roles in
 * an organization and its projects, and whether the organization is active. An interface, so
 * tests use a fake.
 */
export abstract class PolisDirectory {
  /** The user's roles in the organization, or null if they're not a member. */
  abstract membershipRoles(
    userId: string,
    organizationId: string,
    subjectType?: SubjectType,
  ): Promise<OrganizationRole[] | null>;

  /** The user's explicit project roles in the organization, by project ID. */
  abstract projectRoles(
    userId: string,
    organizationId: string,
    subjectType?: SubjectType,
  ): Promise<Record<string, ProjectRole>>;

  /** The organization's status, or null if it doesn't exist. */
  abstract organizationStatus(
    organizationId: string,
  ): Promise<'active' | 'suspended' | null>;
}
