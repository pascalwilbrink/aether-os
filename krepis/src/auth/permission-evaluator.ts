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

/** The fixed role → permission table. */
@Injectable()
export class FixedPermissionEvaluator extends PermissionEvaluator {
  hasOrganizationPermission(
    principal: Principal,
    permission: OrganizationPermission,
  ): boolean {
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
    return projectRoleGrants(
      this.projectRole(principal, projectId),
      permission,
    );
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
    // A task token is limited to its own project.
    if (principal.projectId !== null && principal.projectId !== projectId) {
      return null;
    }
    return effectiveProjectRole(
      principal.organizationRoles,
      principal.projectRoles[projectId],
    );
  }
}
