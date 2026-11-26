import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@ergon/core';

/**
 * Who is responsible for a work item, or takes part in it (ergon/CLAUDE.md,
 * WorkAssignment). Ending one keeps it, as history: a reassignment ends the
 * old `responsible` assignment and starts a new one.
 */
@Entity({ name: 'work_assignments' })
@Check(
  'ck_work_assignments_kind',
  `assignee_kind IN ('user', 'agent', 'council')`,
)
@Check(
  'ck_work_assignments_role',
  `role IN ('responsible', 'contributor', 'reviewer', 'observer')`,
)
@Check('ck_work_assignments_status', `status IN ('active', 'ended')`)
// At most one active responsible assignment per work item.
@Index('ux_work_assignments_responsible', ['workItemId'], {
  unique: true,
  where: `role = 'responsible' AND status = 'active'`,
})
// The same assignee holds a role on a work item once at a time.
@Index(
  'ux_work_assignments_active',
  ['workItemId', 'assigneeKind', 'assigneeId', 'role'],
  { unique: true, where: `status = 'active'` },
)
// A work item's assignments, newest first.
@Index('ix_work_assignments_work_item_started_at_id', [
  'workItemId',
  'startedAt',
  'id',
])
export class WorkAssignmentEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  workItemId: string;

  @Column({ type: 'text' })
  assigneeKind: ApiTypes.AssigneeKind;

  /** A Pistis `sub` for a user; Agora's ID for an agent or council. */
  @Column({ type: 'text' })
  assigneeId: string;

  @Column({ type: 'uuid', nullable: true })
  assigneeVersionId: string | null;

  @Column({ type: 'text' })
  role: ApiTypes.WorkAssignmentRole;

  @Column({ type: 'text' })
  status: ApiTypes.WorkAssignmentStatus;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'jsonb' })
  assignedBy: ApiTypes.Actor;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  endedBy: ApiTypes.Actor | null;

  @Column({ type: 'text', nullable: true })
  endReason: string | null;

  /** 1 while active, 2 once ended (events' `aggregateVersion`). */
  @Column({ type: 'integer' })
  version: number;
}
