import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import type { ApiTypes } from '@hephaestus/core';

import type { ExecutionFailureReason } from './runner.errors.js';

export type ExecutionStatus =
  | 'provisioning'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  /** A budget ran out (docs/models.md); the task resumes in a new execution. */
  | 'paused';

export const ACTIVE_EXECUTION: readonly ExecutionStatus[] = [
  'provisioning',
  'running',
];

/**
 * One try at a task, in one sandbox (docs/tasks.md, Executions). A task has
 * at most one active execution; automatic retries and retries by people are
 * new executions of the same task.
 */
@Entity({ name: 'executions' })
@Unique('uq_executions_task_id_number', ['taskId', 'number'])
@Check(
  'ck_executions_status',
  `status IN ('provisioning', 'running', 'completed', 'failed', 'cancelled', 'paused')`,
)
@Check(
  'ck_executions_failure_reason',
  `failure_reason IS NULL OR failure_reason IN ('agent_failed', 'timeout', 'infrastructure', 'access_denied', 'interrupted', 'verification_failed')`,
)
// One active execution per task, whatever the runners do.
@Index('uq_executions_active_task_id', ['taskId'], {
  unique: true,
  where: `status IN ('provisioning', 'running')`,
})
// The reaper's scan of active executions.
@Index('ix_executions_active_heartbeat_at', ['heartbeatAt'], {
  where: `status IN ('provisioning', 'running')`,
})
// Keyset pagination: a task's executions, newest first.
@Index('ix_executions_task_id_started_at_id', ['taskId', 'startedAt', 'id'])
export class ExecutionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid' })
  taskId: string;

  /** The task's attempt this execution belongs to. */
  @Column({ type: 'integer' })
  attempt: number;

  /** 1, 2, … within the task. */
  @Column({ type: 'integer' })
  number: number;

  @Column({ type: 'text' })
  status: ExecutionStatus;

  @Column({ type: 'text', nullable: true })
  failureReason: ExecutionFailureReason | null;

  /** For people; never secrets. */
  @Column({ type: 'text', nullable: true })
  error: string | null;

  /** What the agent reported (until artifacts exist). */
  @Column({ type: 'text', nullable: true })
  summary: string | null;

  /** The Hephaestus instance running it. */
  @Column({ type: 'text' })
  runnerId: string;

  /** The provisioner's reference to its sandbox, while it has one. */
  @Column({ type: 'jsonb', nullable: true })
  sandboxReference: Record<string, unknown> | null;

  /**
   * The repository it worked in (docs/git.md): where it started, then what
   * the agent committed. Null for a task without one.
   */
  @Column({ type: 'jsonb', nullable: true })
  repository: ApiTypes.ExecutionRepository | null;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz' })
  heartbeatAt: Date;

  /** When the run timeout expires (set once it runs). */
  @Column({ type: 'timestamptz', nullable: true })
  deadlineAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;
}
