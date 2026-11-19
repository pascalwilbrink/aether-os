import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { OrganizationRole, ProjectRole } from '@kerykes/core';

export type MembershipStatus = 'active' | 'revoked';

/**
 * A user's organization membership, copied from Polis (its
 * `membership.*` events, or a sync for an organization Kerykes hadn't
 * seen): who may be told about what. A revoked one stays as a tombstone, so
 * a late or replayed event can't bring it back.
 */
@Entity('organization_members')
@Check('ck_organization_members_status', `status IN ('active', 'revoked')`)
@Index('ix_organization_members_organization_id_sub', ['organizationId', 'sub'])
export class OrganizationMemberEntity {
  @PrimaryColumn('uuid')
  membershipId: string;

  @Column('uuid')
  organizationId: string;

  @Column('text')
  sub: string;

  @Column('jsonb')
  roles: OrganizationRole[];

  @Column('text')
  status: MembershipStatus;

  /** The last applied event's `aggregateVersion`; 0 for one read in a sync. */
  @Column('integer')
  version: number;

  @Column('timestamptz')
  updatedAt: Date;
}

/** A user's explicit role in a project, copied from Polis like the above. */
@Entity('project_members')
@Check('ck_project_members_status', `status IN ('active', 'revoked')`)
@Check('ck_project_members_role', `role IN ('approver', 'editor', 'viewer')`)
@Index('ix_project_members_organization_id_project_id', [
  'organizationId',
  'projectId',
])
@Index('ix_project_members_organization_id_sub', ['organizationId', 'sub'])
export class ProjectMemberEntity {
  @PrimaryColumn('uuid')
  membershipId: string;

  @Column('uuid')
  organizationId: string;

  @Column('uuid')
  projectId: string;

  @Column('text')
  sub: string;

  @Column('text')
  role: Exclude<ProjectRole, 'admin'>;

  @Column('text')
  status: MembershipStatus;

  @Column('integer')
  version: number;

  @Column('timestamptz')
  updatedAt: Date;
}

/** Organizations whose memberships were read from Polis once. */
@Entity('organization_syncs')
export class OrganizationSyncEntity {
  @PrimaryColumn('uuid')
  organizationId: string;

  @Column('timestamptz')
  syncedAt: Date;
}
