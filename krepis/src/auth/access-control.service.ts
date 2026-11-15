import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PermissionEvaluator } from './permission-evaluator.js';
import type {
  OrganizationPermission,
  PlatformPermission,
  ProjectPermission,
} from './permissions.js';
import type { Principal } from './principal.js';
import { currentPrincipal } from './request-context.js';

/**
 * Permission checks inside services, for what a route can't express: a
 * resource's project known only once it's loaded (a workspace), lists
 * filtered to visible projects, or rules that depend on who is asking.
 * Reads the request's principal; outside a request (event handlers, jobs)
 * there is none, and checks that need one fail.
 */
@Injectable()
export class AccessControl {
  constructor(private readonly evaluator: PermissionEvaluator) {}

  /** The current request's principal. */
  principal(): Principal {
    const principal = currentPrincipal();
    if (!principal) {
      throw new ForbiddenException('Not authenticated');
    }
    return principal;
  }

  /** The principal, or undefined outside a request. */
  optionalPrincipal(): Principal | undefined {
    return currentPrincipal();
  }

  hasOrganizationPermission(permission: OrganizationPermission): boolean {
    return this.evaluator.hasOrganizationPermission(
      this.principal(),
      permission,
    );
  }

  hasPlatformPermission(permission: PlatformPermission): boolean {
    return this.evaluator.hasPlatformPermission(this.principal(), permission);
  }

  /**
   * 404 unless the project is visible to the principal (`project:read`),
   * 403 without the permission. Platform services with `platform:read`
   * pass read-only checks (`*:read`).
   */
  assertProjectPermission(
    projectId: string,
    permission: ProjectPermission,
  ): void {
    const principal = this.principal();
    if (principal.subType === 'service' && permission.endsWith(':read')) {
      if (this.evaluator.hasPlatformPermission(principal, 'platform:read')) {
        return;
      }
    }
    if (
      !this.evaluator.hasProjectPermission(principal, projectId, 'project:read')
    ) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
    if (
      !this.evaluator.hasProjectPermission(principal, projectId, permission)
    ) {
      throw new ForbiddenException(`Missing permission ${permission}`);
    }
  }

  /**
   * The projects the principal may read in its organization: `'all'` for
   * organization owners and admins (and platform readers), otherwise the
   * explicitly granted ones (capped), for filtering lists.
   */
  readableProjects(): 'all' | string[] {
    const principal = this.principal();
    if (
      principal.subType === 'service' &&
      this.evaluator.hasPlatformPermission(principal, 'platform:read')
    ) {
      return 'all';
    }
    if (
      principal.organizationRoles.includes('owner') ||
      principal.organizationRoles.includes('admin')
    ) {
      return principal.projectId ? [principal.projectId] : 'all';
    }
    return Object.keys(principal.projectRoles).filter((projectId) =>
      this.evaluator.hasProjectPermission(principal, projectId, 'project:read'),
    );
  }
}
