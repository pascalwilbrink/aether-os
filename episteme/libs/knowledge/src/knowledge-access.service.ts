import {
  ForbiddenException,
  Injectable,
  PreconditionFailedException,
} from '@nestjs/common';

import {
  AccessControl,
  type OrganizationPermission,
  type ProjectPermission,
} from '@episteme/core';
import { PersonDirectory } from '@episteme/persons';
import { TenancyService, type Owner } from '@episteme/tenancy';

import { personsIn, type StewardRole } from './domain/index.js';
import type {
  Actor,
  KnowledgeResourceEntity,
  KnowledgeVersionEntity,
} from './entities/index.js';
import { resourceArchived } from './knowledge.errors.js';

/** What a caller does with a resource; the permission follows its owner. */
export type KnowledgeAction =
  'read' | 'draft' | 'review' | 'publish' | 'govern';

const ORGANIZATION: Record<KnowledgeAction, OrganizationPermission> = {
  read: 'org:knowledge:read',
  draft: 'org:knowledge:draft',
  review: 'org:knowledge:review',
  publish: 'org:knowledge:publish',
  govern: 'org:knowledge:govern',
};

/** A project's resource takes the project's knowledge permissions, as Seshat's items do. */
const PROJECT: Record<KnowledgeAction, ProjectPermission> = {
  read: 'knowledge:read',
  draft: 'knowledge:propose',
  review: 'knowledge:approve',
  publish: 'knowledge:approve',
  govern: 'project:manage',
};

/**
 * Who may do what with a resource (episteme/CLAUDE.md, Security): the
 * permission for the action follows the resource's owner (the organization
 * and departments: `org:knowledge:*`; a project: its `knowledge:*`), and
 * stewardship decides where the contract says "as one of its owners".
 * Stewards are Polis persons; the caller is one when Polis links them to
 * the caller's user.
 */
@Injectable()
export class KnowledgeAccess {
  constructor(
    private readonly access: AccessControl,
    private readonly persons: PersonDirectory,
    private readonly tenancy: TenancyService,
  ) {}

  /** The caller, as resources record it. */
  actor(): Actor {
    const principal = this.access.principal();
    return {
      sub: principal.sub,
      subType: principal.subType,
      agentId: principal.agentId,
      agentVersionId: principal.agentVersionId,
      taskId: principal.taskId,
    };
  }

  /** Whether the caller may take the action on what this owner owns. */
  can(owner: Owner, action: KnowledgeAction): boolean {
    if (action === 'read' && this.isPlatformReader()) return true;
    if (owner.projectId) {
      try {
        this.access.assertProjectPermission(owner.projectId, PROJECT[action]);
        return true;
      } catch {
        return false;
      }
    }
    return this.access.hasOrganizationPermission(ORGANIZATION[action]);
  }

  /**
   * 403 without the permission; a project's resource whose project the
   * caller can't read is a 404, as if it didn't exist.
   */
  assertCan(owner: Owner, action: KnowledgeAction): void {
    if (action === 'read' && this.isPlatformReader()) return;
    if (owner.projectId) {
      this.access.assertProjectPermission(owner.projectId, PROJECT[action]);
      return;
    }
    const permission = ORGANIZATION[action];
    if (!this.access.hasOrganizationPermission(permission)) {
      throw new ForbiddenException(`Missing permission ${permission}`);
    }
  }

  /** The projects whose resources the caller may read: `all`, or their IDs. */
  readableProjects(): 'all' | string[] {
    return this.access.readableProjects();
  }

  /** Whether the caller may read the organization's and departments' resources. */
  readsOrganization(): boolean {
    return (
      this.isPlatformReader() ||
      this.access.hasOrganizationPermission('org:knowledge:read')
    );
  }

  /** The persons of Polis the caller is (none for services and agents). */
  async callerPersons(organizationId: string): Promise<Set<string>> {
    const principal = this.access.principal();
    if (principal.subType !== 'user') return new Set();
    return new Set(
      await this.persons.personsOfUser(organizationId, principal.sub),
    );
  }

  /** Whether the caller is one of the resource's stewards in these roles. */
  async isSteward(
    resource: KnowledgeResourceEntity,
    roles: readonly StewardRole[],
  ): Promise<boolean> {
    const holders = personsIn(resource.stewards, roles);
    if (holders.size === 0) return false;
    for (const person of await this.callerPersons(resource.organizationId)) {
      if (holders.has(person)) return true;
    }
    return false;
  }

  /**
   * 403 unless the caller may take the action, or drafts and is one of the
   * resource's owners (404 for a project the caller can't read).
   */
  async assertOwnerOr(
    resource: KnowledgeResourceEntity,
    action: KnowledgeAction,
  ): Promise<void> {
    this.assertCan(resource, 'read');
    if (this.can(resource, action)) return;
    if (
      this.can(resource, 'draft') &&
      (await this.isSteward(resource, ['owner']))
    ) {
      return;
    }
    throw new ForbiddenException(
      `Only the resource's owners or those who may ${action} it may do this`,
    );
  }

  /**
   * 403 unless the caller drafts and wrote the version (or submitted it:
   * `author`), or is an owner or maintainer of the resource.
   */
  async assertCanEdit(
    resource: KnowledgeResourceEntity,
    version: KnowledgeVersionEntity,
    author: Actor = version.authoredBy,
  ): Promise<void> {
    this.assertCan(resource, 'draft');
    if (author.sub === this.access.principal().sub) return;
    if (await this.isSteward(resource, ['owner', 'maintainer'])) return;
    throw new ForbiddenException(
      "Only its author and the resource's owners and maintainers may do this",
    );
  }

  /**
   * Before a change: the owner accepts writes (Polis), the resource isn't
   * archived, and `If-Match` (if any) is its version.
   */
  async assertWritable(
    resource: KnowledgeResourceEntity,
    ifMatch?: string,
  ): Promise<void> {
    if (ifMatch !== undefined)
      assertMatches(ifMatch, resource.version, 'Resource');
    if (resource.status === 'archived') throw resourceArchived();
    await this.tenancy.assertOwnerAcceptsWrites(
      resource.organizationId,
      resource,
    );
  }

  async assertOwnerWritable(
    organizationId: string,
    owner: Owner,
  ): Promise<void> {
    await this.tenancy.assertOwnerAcceptsWrites(organizationId, owner);
  }

  private isPlatformReader(): boolean {
    const principal = this.access.principal();
    return (
      principal.subType === 'service' &&
      this.access.hasPlatformPermission('platform:read')
    );
  }
}

/** 412 unless `If-Match` names this version (`"3"`, `3` or `W/"3"`). */
export function assertMatches(
  ifMatch: string,
  current: number,
  what: string,
): void {
  const match = /^(?:W\/)?"?(\d+)"?$/.exec(ifMatch.trim());
  if (!match || Number(match[1]) !== current) {
    throw new PreconditionFailedException(`${what} is at ${current}`);
  }
}
