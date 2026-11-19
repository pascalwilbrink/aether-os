import type { OrganizationRole, ProjectRole } from '@kerykes/core';

/** A user's organization membership, as Polis has it now. */
export interface MemberInfo {
  membershipId: string;
  sub: string;
  roles: OrganizationRole[];
}

/** A user's explicit role in one project. */
export interface ProjectGrantInfo {
  membershipId: string;
  projectId: string;
  role: Exclude<ProjectRole, 'admin'>;
}

export interface UserInfo {
  displayName: string;
  /** Null when the user has none on file. */
  email: string | null;
  status: 'active' | 'disabled';
}

/**
 * Who people are and where they belong, from Polis and Pistis, asked with
 * Kerykes's own token (`platform:read`). Throws `DirectoryUnavailableError`
 * when either can't answer. An interface, so tests use a fake.
 */
export abstract class Directory {
  /** Every user member of the organization (service accounts left out). */
  abstract organizationMembers(organizationId: string): Promise<MemberInfo[]>;

  /** One user's explicit project roles in the organization. */
  abstract projectGrants(
    organizationId: string,
    sub: string,
  ): Promise<ProjectGrantInfo[]>;

  /** A project's name, or null when Polis doesn't know it. */
  abstract projectName(
    organizationId: string,
    projectId: string,
  ): Promise<string | null>;

  /** A user's profile in Pistis, or null when there's no such user. */
  abstract user(sub: string): Promise<UserInfo | null>;
}
