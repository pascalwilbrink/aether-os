import {
  ForbiddenException,
  Injectable,
  PreconditionFailedException,
} from '@nestjs/common';

import { AccessControl, type OrganizationPermission } from '@episteme/core';
import { PersonDirectory } from '@episteme/persons';
import { TenancyService } from '@episteme/tenancy';

import { personsIn, type StewardRole } from './domain/index.js';
import type {
  Actor,
  KnowledgeResourceEntity,
  KnowledgeVersionEntity,
} from './entities/index.js';
import { resourceArchived } from './knowledge.errors.js';

/**
 * Who may do what with a resource (episteme/CLAUDE.md, Security), beyond
 * the route's permission: stewardship decides where the contract says "as
 * one of its owners" and the like. Stewards are Polis persons; the caller is
 * one when Polis links them to the caller's user.
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

  has(permission: OrganizationPermission): boolean {
    return this.access.hasOrganizationPermission(permission);
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

  /** 403 unless the caller holds the permission or is one of the resource's owners. */
  async assertOwnerOr(
    resource: KnowledgeResourceEntity,
    permission: OrganizationPermission,
  ): Promise<void> {
    if (this.has(permission) || (await this.isSteward(resource, ['owner'])))
      return;
    throw new ForbiddenException(
      `Only the resource's owners or those with ${permission} may do this`,
    );
  }

  /** 403 unless the caller wrote the version or is an owner or maintainer of the resource. */
  async assertCanEdit(
    resource: KnowledgeResourceEntity,
    version: KnowledgeVersionEntity,
    author: Actor = version.authoredBy,
  ): Promise<void> {
    if (author.sub === this.access.principal().sub) return;
    if (await this.isSteward(resource, ['owner', 'maintainer'])) return;
    throw new ForbiddenException(
      "Only its author and the resource's owners and maintainers may do this",
    );
  }

  /**
   * Before a change: the organization accepts writes (Polis), the resource
   * isn't archived, and `If-Match` (if any) is its version.
   */
  async assertWritable(
    resource: KnowledgeResourceEntity,
    ifMatch?: string,
  ): Promise<void> {
    if (ifMatch !== undefined)
      assertMatches(ifMatch, resource.version, 'Resource');
    if (resource.status === 'archived') throw resourceArchived();
    await this.tenancy.assertOrganizationAcceptsWrites(resource.organizationId);
  }

  async assertOrganizationWritable(organizationId: string): Promise<void> {
    await this.tenancy.assertOrganizationAcceptsWrites(organizationId);
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
