/**
 * The one role → permission table of Aether-os (docs/identity.md,
 * Permissions). Every service checks permissions through Krepis against
 * this table; services never keep their own role checks.
 */

export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';
/** Granted project roles; `admin` only comes from the organization role. */
export type ProjectRole = 'admin' | 'approver' | 'editor' | 'viewer';

export const ORGANIZATION_ROLES: readonly OrganizationRole[] = [
  'owner',
  'admin',
  'member',
  'viewer',
];
export const PROJECT_ROLES: readonly ProjectRole[] = [
  'admin',
  'approver',
  'editor',
  'viewer',
];

const ORGANIZATION_PERMISSIONS = {
  'org:read': ['owner', 'admin', 'member', 'viewer'],
  'org:manage': ['owner', 'admin'],
  'idp:manage': ['owner'],
  'member:read': ['owner', 'admin', 'member', 'viewer'],
  'member:manage': ['owner', 'admin'],
  'service-account:manage': ['owner', 'admin'],
  'project:create': ['owner', 'admin', 'member'],
  'agent:read': ['owner', 'admin', 'member', 'viewer'],
  'agent:write': ['owner', 'admin', 'member'],
  'agent:publish': ['owner', 'admin'],
  'org:task-template:manage': ['owner', 'admin'],
  'org:policy:write': ['owner', 'admin'],
  'org:secret:write': ['owner', 'admin'],
  // Organization-wide project knowledge in Seshat (docs/knowledge.md).
  'org:knowledge:write': ['owner', 'admin'],
} as const satisfies Record<string, readonly OrganizationRole[]>;

const PROJECT_PERMISSIONS = {
  'project:read': ['admin', 'approver', 'editor', 'viewer'],
  'project:manage': ['admin'],
  'project-member:manage': ['admin'],
  'automation:read': ['admin', 'approver', 'editor', 'viewer'],
  'automation:manage': ['admin'],
  'policy:write': ['admin'],
  'secret:write': ['admin'],
  'task-template:manage': ['admin'],
  'task:read': ['admin', 'approver', 'editor', 'viewer'],
  'task:create': ['admin', 'approver', 'editor'],
  'task:cancel': ['admin', 'approver', 'editor'],
  'task:approve': ['admin', 'approver'],
  'workspace:read': ['admin', 'approver', 'editor', 'viewer'],
  'workspace:manage': ['admin', 'approver', 'editor'],
  // Files in Loculus (docs/files.md): reading them, and uploading or deleting.
  'file:read': ['admin', 'approver', 'editor', 'viewer'],
  'file:write': ['admin', 'approver', 'editor'],
  // Project knowledge in Seshat (docs/knowledge.md): reading it, writing
  // items and documents (agents only propose), and accepting proposals
  // (people only, like task:approve).
  'knowledge:read': ['admin', 'approver', 'editor', 'viewer'],
  'knowledge:write': ['admin', 'approver', 'editor'],
  'knowledge:approve': ['admin', 'approver'],
  // A short-lived token for a linked repository (Proxenos); only task tokens.
  'repository:token': ['admin', 'approver', 'editor'],
} as const satisfies Record<string, readonly ProjectRole[]>;

/**
 * Platform permissions: what a platform service (`sub_type: service`, no
 * organization) may do with its own token, granted per service as scopes by
 * Pistis (its client's allowed scopes). Never held by users or service
 * accounts.
 */
export const PLATFORM_PERMISSIONS = [
  'platform:read',
  'platform:manage',
] as const;

export type OrganizationPermission = keyof typeof ORGANIZATION_PERMISSIONS;
export type ProjectPermission = keyof typeof PROJECT_PERMISSIONS;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];
export type Permission = OrganizationPermission | ProjectPermission;

export function isProjectPermission(
  permission: Permission,
): permission is ProjectPermission {
  return permission in PROJECT_PERMISSIONS;
}

/** Whether any of the organization roles grants the permission. */
export function organizationRolesGrant(
  roles: readonly OrganizationRole[],
  permission: OrganizationPermission,
): boolean {
  const allowed: readonly OrganizationRole[] =
    ORGANIZATION_PERMISSIONS[permission];
  return roles.some((role) => allowed.includes(role));
}

/** Whether the project role grants the permission. */
export function projectRoleGrants(
  role: ProjectRole | null,
  permission: ProjectPermission,
): boolean {
  const allowed: readonly ProjectRole[] = PROJECT_PERMISSIONS[permission];
  return role !== null && allowed.includes(role);
}

/** The highest project role an organization role allows (docs/identity.md, the cap). */
export function projectRoleCap(
  roles: readonly OrganizationRole[],
): ProjectRole | null {
  if (roles.includes('owner') || roles.includes('admin')) {
    return 'admin';
  }
  if (roles.includes('member')) {
    return 'approver';
  }
  return roles.includes('viewer') ? 'viewer' : null;
}

/**
 * The project role that counts: `admin` for organization owners and admins,
 * otherwise the explicit grant capped by the organization role, so a stale
 * or inconsistent token can't escalate. `admin` can't be granted explicitly.
 */
export function effectiveProjectRole(
  organizationRoles: readonly OrganizationRole[],
  granted: ProjectRole | undefined,
): ProjectRole | null {
  const cap = projectRoleCap(organizationRoles);
  if (cap === 'admin') {
    return 'admin';
  }
  if (!cap || !granted || granted === 'admin') {
    return null;
  }
  return PROJECT_ROLES.indexOf(granted) >= PROJECT_ROLES.indexOf(cap)
    ? granted
    : cap;
}
