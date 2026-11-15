import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { Permission, PlatformPermission } from './permissions.js';
import type { Principal } from './principal.js';

export const ACCESS_METADATA = 'aether-os:access';

export interface RequirePermissionOptions {
  /** The route parameter holding the project, for a project-scoped permission. */
  project?: string;
}

/** How a route is protected; every route declares exactly one kind (or is denied). */
export interface AccessRule {
  public?: true;
  authenticated?: true;
  permission?: { name: Permission; project?: string };
  platform?: PlatformPermission;
}

const mergeAccess = (rule: AccessRule): MethodDecorator & ClassDecorator =>
  ((target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    const holder = descriptor ? (descriptor.value as object) : target;
    const existing =
      (Reflect.getMetadata(ACCESS_METADATA, holder) as
        AccessRule | undefined) ?? {};
    Reflect.defineMetadata(ACCESS_METADATA, { ...existing, ...rule }, holder);
    return descriptor ?? target;
  }) as MethodDecorator & ClassDecorator;

/** No token needed (health checks, standard endpoints). */
export const Public = (): MethodDecorator & ClassDecorator =>
  mergeAccess({ public: true });

/**
 * Any valid token; the handler decides the rest (e.g. creating an
 * organization, or listing one's own memberships).
 */
export const Authenticated = (): MethodDecorator & ClassDecorator =>
  mergeAccess({ authenticated: true });

/**
 * The permission the caller needs (docs/identity.md, Enforcement):
 *
 * ```ts
 * @RequirePermission('agent:publish')                           // organization-scoped
 * @RequirePermission('task:approve', { project: 'projectId' })  // project from a route parameter
 * ```
 *
 * Organization-scoped routes have an `:organizationId` parameter, which must
 * be the token's organization.
 */
export const RequirePermission = (
  permission: Permission,
  options: RequirePermissionOptions = {},
): MethodDecorator & ClassDecorator =>
  mergeAccess({ permission: { name: permission, project: options.project } });

/**
 * Also lets platform services in with their own token (no organization),
 * if Pistis granted them this platform permission. Combine with
 * `@RequirePermission` for routes users reach too.
 */
export const PlatformAccess = (
  permission: PlatformPermission,
): MethodDecorator & ClassDecorator => mergeAccess({ platform: permission });

/** The authenticated principal (`@CurrentPrincipal() principal: Principal`). */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const principal = ctx
      .switchToHttp()
      .getRequest<{ principal?: Principal }>().principal;
    if (!principal) {
      throw new Error('@CurrentPrincipal() on a route without authentication');
    }
    return principal;
  },
);
