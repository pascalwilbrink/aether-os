import type { ApiTypes } from '@polis/core';

export type OrganizationRole = ApiTypes.OrganizationRole;
export type SubjectType = ApiTypes.SubjectType;

/** The fixed organization roles (docs/identity.md), highest first. */
export const ORGANIZATION_ROLES: readonly OrganizationRole[] = [
  'owner',
  'admin',
  'member',
  'viewer',
];

/** Each role once, highest first, so equal role sets look the same. */
export function normalizeRoles(
  roles: readonly OrganizationRole[],
): OrganizationRole[] {
  return ORGANIZATION_ROLES.filter((role) => roles.includes(role));
}
