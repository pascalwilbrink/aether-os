import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ACCESS_METADATA, type AccessRule } from './decorators.js';
import { PermissionEvaluator } from './permission-evaluator.js';
import { isProjectPermission } from './permissions.js';
import type { Principal } from './principal.js';
import { currentRequestContext } from './request-context.js';
import { TokenVerifier } from './token-verifier.js';

interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  params: Record<string, string | undefined>;
  principal?: Principal;
}

/**
 * The global guard (docs/identity.md, Enforcement), in three steps:
 *
 * 1. **Authentication:** a valid Pistis bearer token (401 otherwise).
 * 2. **Tenancy:** an `:organizationId` in the route must be the token's
 *    organization, and for a task token a `:projectId` its project. A
 *    mismatch is a 404, so other tenants' IDs aren't confirmed to exist.
 * 3. **Permission:** the route's `@RequirePermission` (a missing project
 *    permission is a 404 when the project isn't visible at all, else 403),
 *    or `@PlatformAccess` for platform services.
 *
 * Fails closed: a route without `@Public`, `@Authenticated`,
 * `@RequirePermission` or `@PlatformAccess` is refused.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    private readonly evaluator: PermissionEvaluator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    const rule = {
      ...this.reflector.get<AccessRule | undefined>(
        ACCESS_METADATA,
        context.getClass(),
      ),
      ...this.reflector.get<AccessRule | undefined>(
        ACCESS_METADATA,
        context.getHandler(),
      ),
    };
    if (rule.public) {
      return true;
    }
    if (!rule.authenticated && !rule.permission && !rule.platform) {
      this.logger.error(
        `${context.getClass().name}.${context.getHandler().name} declares no access rule`,
      );
      throw new ForbiddenException('This route declares no access rule');
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const principal = await this.authenticate(request);
    request.principal = principal;
    const requestContext = currentRequestContext();
    if (requestContext) {
      requestContext.principal = principal;
    }

    if (principal.subType === 'service' && principal.organizationId === null) {
      return this.platform(rule, principal);
    }
    this.tenancy(request.params, principal);
    this.permission(rule, request.params, principal);
    return true;
  }

  private async authenticate(request: AuthRequest): Promise<Principal> {
    const header = request.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    const match = value
      ? /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/i.exec(value)
      : null;
    if (!match) {
      throw new UnauthorizedException('A bearer token is required');
    }
    try {
      return await this.verifier.verify(match[1]);
    } catch {
      throw new UnauthorizedException('The token is invalid or expired');
    }
  }

  private platform(rule: AccessRule, principal: Principal): boolean {
    if (
      rule.platform &&
      this.evaluator.hasPlatformPermission(principal, rule.platform)
    ) {
      return true;
    }
    if (rule.authenticated && !rule.permission && !rule.platform) {
      return true;
    }
    throw new ForbiddenException(
      'Platform services need a platform permission for this',
    );
  }

  private tenancy(params: AuthRequest['params'], principal: Principal): void {
    const organizationId = params.organizationId;
    if (
      organizationId !== undefined &&
      organizationId !== principal.organizationId
    ) {
      throw new NotFoundException(`Organization ${organizationId} not found`);
    }
    const projectId = params.projectId;
    if (
      projectId !== undefined &&
      principal.projectId !== null &&
      projectId !== principal.projectId
    ) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
  }

  private permission(
    rule: AccessRule,
    params: AuthRequest['params'],
    principal: Principal,
  ): void {
    if (!rule.permission) {
      if (rule.authenticated) {
        return;
      }
      // Only @PlatformAccess: not for organization tokens.
      throw new ForbiddenException('Only platform services may do this');
    }
    const { name, project } = rule.permission;
    if (!isProjectPermission(name)) {
      if (!this.evaluator.hasOrganizationPermission(principal, name)) {
        throw new ForbiddenException(`Missing permission ${name}`);
      }
      return;
    }

    const projectId = project ? params[project] : undefined;
    if (!projectId) {
      throw new Error(
        `@RequirePermission('${name}') needs { project: '<route parameter>' }`,
      );
    }
    if (
      !this.evaluator.hasProjectPermission(principal, projectId, 'project:read')
    ) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
    if (!this.evaluator.hasProjectPermission(principal, projectId, name)) {
      throw new ForbiddenException(`Missing permission ${name}`);
    }
  }
}
