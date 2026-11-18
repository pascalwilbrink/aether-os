import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import type { ApiTypes } from '@hephaestus/core';
import type { BudgetScope } from '@hephaestus/models';

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
  'ck_tasks_paused_for',
  `paused_for IS NULL OR paused_for IN ('organization', 'project', 'task_tree')`,
)
@Check(
  'ck_tasks_failure_reason',
  `failure_reason IS NULL OR failure_reason IN ('agent_failed', 'verification_failed', 'rejected', 'timeout', 'budget_exceeded', 'infrastructure', 'subtask_failed', 'access_denied')`,
)
// Keyset pagination: a project's tasks, newest first.
@Index('ix_tasks_project_id_created_at_id', ['projectId', 'createdAt', 'id'])
// A task's subtasks, and a tree (dependents, cancellation).
@Index('ix_tasks_parent_task_id', ['parentTaskId'])
@Index('ix_tasks_top_level_task_id', ['topLevelTaskId'])
// The queue (TaskQueue) and the concurrency counts.
@Index('ix_tasks_status_organization_id', ['status', 'organizationId'])
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

  /** While `paused`: the budget that ran out (docs/models.md). */
  @Column({ type: 'text', nullable: true })
  pausedFor: BudgetScope | null;

  /** Tasks under the same top-level task that must succeed first. */
  @Column({ type: 'uuid', array: true, default: () => "'{}'" })
  dependsOn: string[];

  /** 1, plus one per retry. */
  @Column({ type: 'integer', default: 1 })
  attempt: number;

  /** The caller's `Idempotency-Key` (or a command's message ID). */
  @Column({ type: 'text' })
  idempotencyKey: string;

  /** Artifact kinds that need approval (`*`: all); pinned at creation. */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  reviewArtifactKinds: string[];

  /** The definition of done, fixed at creation (docs/tasks.md). */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  acceptanceCriteria: ApiTypes.AcceptanceCriterion[];

  /** Times the task has entered `awaiting_review`. */
  @Column({ type: 'integer', default: 0 })
  reviewRound: number;

  /**
   * The repository link (Proxenos) it works in, its own or its parent's
   * (docs/git.md); checked when it runs.
   */
  @Column({ type: 'uuid', nullable: true })
  repositoryLinkId: string | null;

  /** The template version it was created from (docs/tasks.md), if any. */
  @Column({ type: 'uuid', nullable: true })
  taskTemplateId: string | null;

  @Column({ type: 'integer', nullable: true })
  taskTemplateVersion: number | null;

  /** A succeeded task's outcome (docs/tasks.md, Primary artifact). */
  @Column({ type: 'uuid', nullable: true })
  primaryArtifactId: string | null;

  /**
   * A queued task isn't started before this (backoff after a failure); a
   * delivering one isn't delivered before it (a delivery's lease, or its
   * backoff).
   */
  @Column({ type: 'timestamptz', nullable: true })
  nextAttemptAt: Date | null;

  /** Tries at delivering (opening pull requests) since it last succeeded. */
  @Column({ type: 'integer', default: 0 })
  deliveryAttempts: number;

  /**
   * A top-level task whose tree's branch should go (docs/git.md: the tree
   * failed or was cancelled, or its pull request was merged or closed);
   * not before this time. Null: nothing to clean up.
   */
  @Column({ type: 'timestamptz', nullable: true })
  branchCleanupAt: Date | null;

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
