import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * One attempt at a work item (ergon/CLAUDE.md, WorkExecution): a Hephaestus
 * task started for it, with the task's state as Hephaestus last announced
 * it. Hephaestus stays the source of truth; this is a projection, kept from
 * its events in their order (`taskVersion`).
 */
@Entity({ name: 'work_executions' })
@Index('ux_work_executions_task_id', ['taskId'], { unique: true })
// A work item's executions, newest first.
@Index('ix_work_executions_work_item_created_at_id', [
  'workItemId',
  'createdAt',
  'id',
])
export class WorkExecutionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  workItemId: string;

  @Column({ type: 'uuid' })
  taskId: string;

  @Column({ type: 'uuid' })
  agentId: string;

  @Column({ type: 'uuid' })
  agentVersionId: string;

  /** The task's status in Hephaestus. */
  @Column({ type: 'text' })
  status: string;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'uuid', nullable: true })
  primaryArtifactId: string | null;

  /** The task's version (its events' `aggregateVersion`) last applied. */
  @Column({ type: 'integer' })
  taskVersion: number;

  /** Grows with every `work-execution.*` event. */
  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null;
}
