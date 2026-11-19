import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@kairos/core';

export type AutomationRunStatus = ApiTypes.AutomationRunStatus;
export type RunEvent = ApiTypes.AutomationRunResponse['event'];

/**
 * One time an automation fired: the event that fired it, and what came of
 * the `task.create` command it sent (whose idempotency key is the run's ID).
 * One per automation and event, so a redelivered event never fires twice.
 */
@Entity({ name: 'automation_runs' })
@Check(
  'ck_automation_runs_status',
  `status IN ('requested', 'created', 'rejected')`,
)
@Index(
  'uq_automation_runs_automation_id_source_event_id',
  ['automationId', 'sourceEventId'],
  { unique: true },
)
// Keyset pagination: an automation's runs, newest first.
@Index('ix_automation_runs_automation_id_created_at_id', [
  'automationId',
  'createdAt',
  'id',
])
export class AutomationRunEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  automationId: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'text' })
  status: AutomationRunStatus;

  /** The Proxenos event's `eventId`. */
  @Column({ type: 'uuid' })
  sourceEventId: string;

  @Column({ type: 'jsonb' })
  event: RunEvent;

  @Column({ type: 'uuid', nullable: true })
  taskId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  rejection: { code: string; message: string } | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
