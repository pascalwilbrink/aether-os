import { Injectable } from '@nestjs/common';

import {
  effectiveProjectRole,
  organizationRolesGrant,
  projectRoleGrants,
  type OrganizationPermission,
  type PlatformPermission,
  type ProjectPermission,
  type ProjectRole,
} from './permissions.js';
import type { Principal } from './principal.js';

/**
 * Decides permissions for a principal (docs/identity.md, Enforcement). The
 * first implementation is the fixed table in `permissions.ts`; an OPA-backed
 * one can replace it without touching endpoints.
 */
export abstract class PermissionEvaluator {
  /** An organization-scoped permission in the principal's organization. */
  abstract hasOrganizationPermission(
    principal: Principal,
    permission: OrganizationPermission,
  ): boolean;

  /** A project-scoped permission in a project of the principal's organization. */
  abstract hasProjectPermission(
    principal: Principal,
    projectId: string,
    permission: ProjectPermission,
  ): boolean;

  /** A platform permission (platform services only). */
  abstract hasPlatformPermission(
    principal: Principal,
    permission: PlatformPermission,
  ): boolean;

  /** The principal's effective role in a project of its organization. */
  abstract projectRole(
    principal: Principal,
    projectId: string,
  ): ProjectRole | null;
}

/**
 * What a session token may do (docs/interaction.md, Session tokens): read
 * what the person can read in the session's project, and call models for
 * the session when the person may use sessions. Nothing else, whatever the
 * person's roles: the agent sees what they see and changes nothing.
 */
export const SESSION_ORGANIZATION_PERMISSIONS: readonly OrganizationPermission[] =
  ['org:read', 'agent:read', 'council:read'];
export const SESSION_PROJECT_PERMISSIONS: readonly ProjectPermission[] = [
  'project:read',
  'task:read',
  'knowledge:read',
  'file:read',
  'automation:read',
  'workspace:read',
];

/** The fixed role → permission table. */
@Injectable()
export class FixedPermissionEvaluator extends PermissionEvaluator {
  hasOrganizationPermission(
    principal: Principal,
    permission: OrganizationPermission,
  ): boolean {
    if (
      principal.sessionId !== null &&
      !SESSION_ORGANIZATION_PERMISSIONS.includes(permission)
    ) {
      return false;
    }
    return (
      principal.organizationId !== null &&
      organizationRolesGrant(principal.organizationRoles, permission)
    );
  }

  hasProjectPermission(
    principal: Principal,
    projectId: string,
    permission: ProjectPermission,
  ): boolean {
    // Only people approve, work or knowledge: never a service account,
    // whatever its roles.
    if (
      (permission === 'task:approve' || permission === 'knowledge:approve') &&
      principal.subType !== 'user'
    ) {
      return false;
    }
    const role = this.projectRole(principal, projectId);
    if (principal.sessionId !== null) {
      // A session's model calls rest on the person's use of sessions.
      if (permission === 'model:invoke') {
        return projectRoleGrants(role, 'session:use');
      }
      if (!SESSION_PROJECT_PERMISSIONS.includes(permission)) {
        return false;
      }
    }
    return projectRoleGrants(role, permission);
  }

  hasPlatformPermission(
    principal: Principal,
    permission: PlatformPermission,
  ): boolean {
    return (
      principal.subType === 'service' && principal.scopes.includes(permission)
    );
  }

  projectRole(principal: Principal, projectId: string): ProjectRole | null {
    if (principal.organizationId === null) {
      return null;
    }
    // A task or session token is limited to its own project.
    if (principal.projectId !== null && principal.projectId !== projectId) {
      return null;
    }
    return effectiveProjectRole(
      principal.organizationRoles,
      principal.projectRoles[projectId],
    );
  }
}
