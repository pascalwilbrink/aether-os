import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import type { SubjectType } from './department.types.js';

/** A member of the organization in one of its departments (informational). */
@Entity({ name: 'department_members' })
@Unique('uq_department_members_department_id_subject', [
  'departmentId',
  'subjectType',
  'subject',
])
@Check(
  'ck_department_members_subject_type',
  `subject_type IN ('user', 'service_account')`,
)
// Keyset pagination of a department's members.
@Index('ix_department_members_department_id_created_at_id', [
  'departmentId',
  'createdAt',
  'id',
])
// A principal's departments in an organization (removed when it leaves).
@Index('ix_department_members_organization_id_subject', [
  'organizationId',
  'subjectType',
  'subject',
])
export class DepartmentMemberEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  departmentId: string;

  @Column({ type: 'text' })
  subjectType: SubjectType;

  @Column({ type: 'text' })
  subject: string;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
