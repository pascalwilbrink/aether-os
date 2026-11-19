import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  effectiveProjectRole,
  organizationRolesGrant,
  projectRoleGrants,
  type OrganizationPermission,
  type OrganizationRole,
  type ProjectPermission,
  type ProjectRole,
} from '@kerykes/core';
import { Directory } from '@kerykes/directory';

import {
  OrganizationMemberEntity,
  OrganizationSyncEntity,
  ProjectMemberEntity,
  type MembershipStatus,
} from './membership.entities.js';

/** A change to one organization membership, from a Polis event. */
export interface OrganizationMembershipChange {
  membershipId: string;
  organizationId: string;
  sub: string;
  /** Null when revoked. */
  roles: OrganizationRole[] | null;
  version: number;
}

/** A change to one project membership, from a Polis event. */
export interface ProjectMembershipChange {
  membershipId: string;
  organizationId: string;
  projectId: string;
  sub: string;
  /** Null when revoked. */
  role: Exclude<ProjectRole, 'admin'> | null;
  version: number;
}

const ADMIN_ROLES: OrganizationRole[] = ['owner', 'admin'];

/**
 * Kerykes's copy of who belongs where (docs/notifications.md, Recipients),
 * kept from Polis's membership events and, the first time an organization
 * comes up, read from Polis (`ensureSynced`). Every write is
 * version-guarded: an event older than what's stored changes nothing, and
 * a revoked membership stays revoked.
 */
@Injectable()
export class MembershipsService {
  private readonly logger = new Logger(MembershipsService.name);

  constructor(
    @InjectRepository(OrganizationMemberEntity)
    private readonly members: Repository<OrganizationMemberEntity>,
    @InjectRepository(ProjectMemberEntity)
    private readonly grants: Repository<ProjectMemberEntity>,
    @InjectRepository(OrganizationSyncEntity)
    private readonly syncs: Repository<OrganizationSyncEntity>,
    private readonly directory: Directory,
  ) {}

  async applyOrganizationMembership(
    change: OrganizationMembershipChange,
  ): Promise<void> {
    const status: MembershipStatus = change.roles ? 'active' : 'revoked';
    await this.members.query(
      `INSERT INTO organization_members
         (membership_id, organization_id, sub, roles, status, version, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (membership_id) DO UPDATE SET
         roles = CASE WHEN EXCLUDED.status = 'revoked'
                      THEN organization_members.roles ELSE EXCLUDED.roles END,
         status = EXCLUDED.status,
         version = EXCLUDED.version,
         updated_at = EXCLUDED.updated_at
       WHERE organization_members.version < EXCLUDED.version
         AND organization_members.status = 'active'`,
      [
        change.membershipId,
        change.organizationId,
        change.sub,
        JSON.stringify(change.roles ?? []),
        status,
        change.version,
      ],
    );
  }

  async applyProjectMembership(change: ProjectMembershipChange): Promise<void> {
    const status: MembershipStatus = change.role ? 'active' : 'revoked';
    await this.grants.query(
      `INSERT INTO project_members
         (membership_id, organization_id, project_id, sub, role, status, version, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (membership_id) DO UPDATE SET
         role = CASE WHEN EXCLUDED.status = 'revoked'
                     THEN project_members.role ELSE EXCLUDED.role END,
         status = EXCLUDED.status,
         version = EXCLUDED.version,
         updated_at = EXCLUDED.updated_at
       WHERE project_members.version < EXCLUDED.version
         AND project_members.status = 'active'`,
      [
        change.membershipId,
        change.organizationId,
        change.projectId,
        change.sub,
        // A revoked one keeps its role (the column has a check).
        change.role ?? 'viewer',
        status,
        change.version,
      ],
    );
  }

  /**
   * Reads the organization's memberships from Polis once, for an
   * organization whose members joined before Kerykes listened: they're
   * added as version 0, so anything an event already wrote wins.
   */
  async ensureSynced(organizationId: string): Promise<void> {
    if (await this.syncs.existsBy({ organizationId })) {
      return;
    }
    const members = await this.directory.organizationMembers(organizationId);
    for (const member of members) {
      await this.members.query(
        `INSERT INTO organization_members
           (membership_id, organization_id, sub, roles, status, version, updated_at)
         VALUES ($1, $2, $3, $4, 'active', 0, now())
         ON CONFLICT (membership_id) DO NOTHING`,
        [
          member.membershipId,
          organizationId,
          member.sub,
          JSON.stringify(member.roles),
        ],
      );
      for (const grant of await this.directory.projectGrants(
        organizationId,
        member.sub,
      )) {
        await this.grants.query(
          `INSERT INTO project_members
             (membership_id, organization_id, project_id, sub, role, status, version, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'active', 0, now())
           ON CONFLICT (membership_id) DO NOTHING`,
          [
            grant.membershipId,
            organizationId,
            grant.projectId,
            member.sub,
            grant.role,
          ],
        );
      }
    }
    await this.syncs
      .createQueryBuilder()
      .insert()
      .values({ organizationId, syncedAt: new Date() })
      .orIgnore()
      .execute();
    this.logger.log(
      `Synced ${members.length} members of organization ${organizationId}`,
    );
  }

  /** A user's organization roles; none when not a member. */
  async organizationRoles(
    organizationId: string,
    sub: string,
  ): Promise<OrganizationRole[]> {
    const rows = await this.members.findBy({
      organizationId,
      sub,
      status: 'active',
    });
    return [...new Set(rows.flatMap((row) => row.roles))];
  }

  /** The project role that counts for a user (Krepis's cap applied), or null. */
  async projectRole(
    organizationId: string,
    projectId: string,
    sub: string,
  ): Promise<ProjectRole | null> {
    const [roles, grant] = await Promise.all([
      this.organizationRoles(organizationId, sub),
      this.grants.findOneBy({
        organizationId,
        projectId,
        sub,
        status: 'active',
      }),
    ]);
    return effectiveProjectRole(roles, grant?.role);
  }

  /** Whether a user holds the permission in the project now. */
  async holdsProjectPermission(
    organizationId: string,
    projectId: string,
    sub: string,
    permission: ProjectPermission,
  ): Promise<boolean> {
    return projectRoleGrants(
      await this.projectRole(organizationId, projectId, sub),
      permission,
    );
  }

  /** Whether a user holds the organization permission now. */
  async holdsOrganizationPermission(
    organizationId: string,
    sub: string,
    permission: OrganizationPermission,
  ): Promise<boolean> {
    return organizationRolesGrant(
      await this.organizationRoles(organizationId, sub),
      permission,
    );
  }

  /** The organization's owners and admins. */
  async organizationAdmins(organizationId: string): Promise<string[]> {
    const rows = await this.members.findBy({
      organizationId,
      status: 'active',
    });
    return unique(
      rows
        .filter((row) => row.roles.some((role) => ADMIN_ROLES.includes(role)))
        .map((row) => row.sub),
    );
  }

  /**
   * The project's approvers (docs/notifications.md, Recipients): users with
   * an explicit `approver` grant who still hold `task:approve` there; the
   * organization's owners and admins when it has none.
   */
  async approvers(
    organizationId: string,
    projectId: string,
  ): Promise<string[]> {
    const grants = await this.grants.findBy({
      organizationId,
      projectId,
      role: 'approver',
      status: 'active',
    });
    const approvers: string[] = [];
    for (const sub of unique(grants.map((grant) => grant.sub))) {
      if (
        await this.holdsProjectPermission(
          organizationId,
          projectId,
          sub,
          'task:approve',
        )
      ) {
        approvers.push(sub);
      }
    }
    return approvers.length > 0
      ? approvers
      : this.organizationAdmins(organizationId);
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
