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

/** An active assignment on a work item in Ergon. */
export interface WorkAssigneeInfo {
  kind: 'person' | 'agent';
  /** Polis's person or Agora's agent. */
  id: string;
  role: 'responsible' | 'contributor' | 'reviewer' | 'observer';
}

/**
 * Who people are and where they belong, from Polis and Pistis, and who
 * takes part in work, from Ergon, asked with Kerykes's own token
 * (`platform:read`). Throws `DirectoryUnavailableError` when one can't
 * answer. An interface, so tests use a fake.
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

  /**
   * The Pistis user a person of the organization is linked to (Polis), or
   * null when there's no such person or they haven't signed up.
   */
  abstract personUser(
    organizationId: string,
    personId: string,
  ): Promise<string | null>;

  /**
   * A work item's active assignments (Ergon; work in a project only), or
   * null when Ergon doesn't know the work item.
   */
  abstract workAssignments(
    organizationId: string,
    workItemId: string,
  ): Promise<WorkAssigneeInfo[] | null>;
}
