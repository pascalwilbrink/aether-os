import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import type { ProjectRole, SubjectType } from './project-membership.types.js';

/** A member's one role in one project (docs/identity.md, project roles). */
@Entity({ name: 'project_memberships' })
@Unique('uq_project_memberships_project_id_subject', [
  'projectId',
  'subjectType',
  'subject',
])
@Check(
  'ck_project_memberships_subject_type',
  `subject_type IN ('user', 'service_account')`,
)
@Check(
  'ck_project_memberships_role',
  `role IN ('approver', 'editor', 'viewer')`,
)
// Keyset pagination: a project's members, and a subject's grants in an organization.
@Index('ix_project_memberships_project_id_created_at_id', [
  'projectId',
  'createdAt',
  'id',
])
@Index('ix_project_memberships_subject_created_at_id', [
  'organizationId',
  'subjectType',
  'subject',
  'createdAt',
  'id',
])
export class ProjectMembershipEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'text' })
  subjectType: SubjectType;

  @Column({ type: 'text' })
  subject: string;

  @Column({ type: 'text' })
  role: ProjectRole;

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
