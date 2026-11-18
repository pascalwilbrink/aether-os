import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import type { TaskFailureReason, TaskStatus } from './task-transitions.js';

/**
 * A unit of work an agent does (docs/tasks.md): a top-level task or, with
 * a parent, a subtask; runs as a service account, with the agent version
 * pinned when it was created.
 */
@Entity({ name: 'tasks' })
@Unique('uq_tasks_organization_id_idempotency_key', [
  'organizationId',
  'idempotencyKey',
])
@Check(
  'ck_tasks_status',
  `status IN ('blocked', 'queued', 'provisioning', 'running', 'verifying', 'awaiting_review', 'waiting', 'paused', 'delivering', 'succeeded', 'failed', 'cancelled')`,
)
@Check(
  'ck_tasks_failure_reason',
  `failure_reason IS NULL OR failure_reason IN ('agent_failed', 'verification_failed', 'rejected', 'timeout', 'budget_exceeded', 'infrastructure', 'subtask_failed')`,
)
// Keyset pagination: a project's tasks, newest first.
@Index('ix_tasks_project_id_created_at_id', ['projectId', 'createdAt', 'id'])
// A task's subtasks, and a tree (dependents, cancellation).
@Index('ix_tasks_parent_task_id', ['parentTaskId'])
@Index('ix_tasks_top_level_task_id', ['topLevelTaskId'])
export class TaskEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid', nullable: true })
  parentTaskId: string | null;

  /** The tree's root; its own ID for a top-level task. */
  @Column({ type: 'uuid' })
  topLevelTaskId: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  instructions: string;

  @Column({ type: 'uuid' })
  agentId: string;

  /** Pinned at creation: runs are reproducible and evaluable per version. */
  @Column({ type: 'uuid' })
  agentVersionId: string;

  /** The Pistis service account the task runs as (never a user). */
  @Column({ type: 'uuid' })
  serviceAccountId: string;

  /** Who created it (a token's `sub`). */
  @Column({ type: 'text' })
  requestedBy: string;

  @Column({ type: 'text' })
  status: TaskStatus;

  @Column({ type: 'text', nullable: true })
  failureReason: TaskFailureReason | null;

  /** Tasks under the same top-level task that must succeed first. */
  @Column({ type: 'uuid', array: true, default: () => "'{}'" })
  dependsOn: string[];

  /** 1, plus one per retry. */
  @Column({ type: 'integer', default: 1 })
  attempt: number;

  /** The caller's `Idempotency-Key` (or a command's message ID). */
  @Column({ type: 'text' })
  idempotencyKey: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  /** Incremented on every change; the `aggregateVersion` of its events. */
  @Column({ type: 'integer', default: 1 })
  version: number;
}
