import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import type { OrganizationRole, SubjectType } from './membership-roles.js';

@Entity({ name: 'memberships' })
@Unique('uq_memberships_organization_id_subject', [
  'organizationId',
  'subjectType',
  'subject',
])
@Check(
  'ck_memberships_subject_type',
  `subject_type IN ('user', 'service_account')`,
)
@Check(
  'ck_memberships_roles',
  `cardinality(roles) >= 1 AND roles <@ ARRAY['owner', 'admin', 'member', 'viewer']::text[]`,
)
// Keyset pagination: an organization's members, and a subject's organizations.
@Index('ix_memberships_organization_id_created_at_id', [
  'organizationId',
  'createdAt',
  'id',
])
@Index('ix_memberships_subject_created_at_id', [
  'subjectType',
  'subject',
  'createdAt',
  'id',
])
export class MembershipEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'text' })
  subjectType: SubjectType;

  @Column({ type: 'text' })
  subject: string;

  @Column({ type: 'text', array: true })
  roles: OrganizationRole[];

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;

  /** Incremented on every change; the `aggregateVersion` of its events. */
  @Column({ type: 'integer', default: 1 })
  version: number;
}
