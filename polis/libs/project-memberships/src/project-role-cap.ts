import { projectRoleCap, type OrganizationRole } from '@polis/core';

import type { ProjectRole, SubjectType } from './project-membership.types.js';

const ORDER: readonly ProjectRole[] = ['approver', 'editor', 'viewer'];

/**
 * The highest project role that may be granted (docs/identity.md, Roles):
 * organization `member` → `approver`, `viewer` → `viewer`; owners and admins
 * are project admins anyway, so anything may be granted (it counts once
 * their organization role is lowered). Service accounts never approve.
 * Null for someone with no organization role.
 */
export function grantableCap(
  subjectType: SubjectType,
  organizationRoles: readonly OrganizationRole[],
): ProjectRole | null {
  const cap = projectRoleCap(organizationRoles);
  if (cap === null) {
    return null;
  }
  const grantable: ProjectRole = cap === 'admin' ? 'approver' : cap;
  return subjectType === 'service_account' && grantable === 'approver'
    ? 'editor'
    : grantable;
}

/** Whether `role` is within `cap`. */
export function withinCap(role: ProjectRole, cap: ProjectRole | null): boolean {
  return cap !== null && ORDER.indexOf(role) >= ORDER.indexOf(cap);
}

/** The lower of the two. */
export function capRole(role: ProjectRole, cap: ProjectRole): ProjectRole {
  return withinCap(role, cap) ? role : cap;
}
