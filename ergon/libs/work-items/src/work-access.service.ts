import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  AccessControl,
  ValidationProblemException,
  type ApiTypes,
} from '@ergon/core';
import { TenancyService } from '@ergon/tenancy';

type Scope = { organizationId: string; projectId: string | null };

/**
 * Who may see and change work (ergon/CLAUDE.md, Security): `work:read` /
 * `work:write` in its project, or `org:work:read` / `org:work:write` for
 * work outside any project, which a token limited to one project (a task's
 * or a session's) never reaches. An assignment grants nothing.
 */
@Injectable()
export class WorkAccess {
  constructor(
    private readonly access: AccessControl,
    private readonly tenancy: TenancyService,
  ) {}

  /** The caller, as work items record it. */
  actor(): ApiTypes.Actor {
    const principal = this.access.principal();
    return {
      sub: principal.sub,
      subType: principal.subType,
      agentId: principal.agentId,
      agentVersionId: principal.agentVersionId,
      taskId: principal.taskId,
    };
  }

  /** How the caller came to create work, when the request doesn't say. */
  defaultSource(): ApiTypes.WorkItemSourceKind {
    const principal = this.access.principal();
    if (principal.subType === 'user') return 'person';
    return principal.agentId ? 'agent' : 'automation';
  }

  /** 404 for a project the caller can't see, 403 without the permission. */
  assertCan(projectId: string | null, kind: 'read' | 'write'): void {
    if (projectId) {
      this.access.assertProjectPermission(projectId, `work:${kind}`);
      return;
    }
    if (
      this.access.principal().projectId !== null ||
      !this.access.hasOrganizationPermission(`org:work:${kind}`)
    ) {
      throw new ForbiddenException(`Missing permission org:work:${kind}`);
    }
  }

  /** `assertCan`, with a work item's own 404 when its project is hidden. */
  assertCanOnItem(
    item: { id: string; projectId: string | null },
    kind: 'read' | 'write',
  ): void {
    try {
      this.assertCan(item.projectId, kind);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(`Work item ${item.id} not found`);
      }
      throw error;
    }
  }

  /**
   * A work item's department and team are active ones of the organization
   * in Polis; `400` naming the field otherwise.
   */
  async assertOwners(
    organizationId: string,
    owners: { departmentId: string | null; teamId: string | null },
  ): Promise<void> {
    const unknown = await this.tenancy.unknownOwners(organizationId, owners);
    if (unknown.length > 0) {
      throw new ValidationProblemException(
        unknown.map((field) => ({
          pointer: `/${field}`,
          parameter: null,
          code: 'INVALID' as const,
          detail: `Not an active ${field === 'departmentId' ? 'department' : 'team'} of the organization.`,
        })),
      );
    }
  }

  /** The organization, and the project if any, accept writes (Polis). */
  async assertAcceptsWrites({
    organizationId,
    projectId,
  }: Scope): Promise<void> {
    if (projectId) {
      await this.tenancy.assertProjectAcceptsWrites(organizationId, projectId);
    } else {
      await this.tenancy.assertOrganizationAcceptsWrites(organizationId);
    }
  }
}
