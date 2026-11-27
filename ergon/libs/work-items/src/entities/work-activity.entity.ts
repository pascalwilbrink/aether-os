import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@ergon/core';

export type ActivityValue = string | number | boolean | null | object;

/**
 * One entry of a work item's record (ergon/CLAUDE.md, WorkActivity),
 * append-only, written in the transaction of the change it records.
 */
@Entity({ name: 'work_activity' })
@Check(
  'ck_work_activity_kind',
  `kind IN ('created', 'updated', 'status_changed', 'assignment_started', 'assignment_ended', 'dependency_added', 'dependency_removed', 'execution_started', 'execution_finished')`,
)
// A work item's record, oldest first.
@Index('ix_work_activity_work_item_created_at_id', [
  'workItemId',
  'createdAt',
  'id',
])
export class WorkActivityEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  workItemId: string;

  @Column({ type: 'text' })
  kind: ApiTypes.WorkActivityKind;

  @Column({ type: 'jsonb', nullable: true })
  actor: ApiTypes.Actor | null;

  @Column({ type: 'jsonb' })
  details: Record<string, ActivityValue>;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
