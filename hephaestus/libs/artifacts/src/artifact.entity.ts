import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@hephaestus/core';

export type ArtifactStatus = ApiTypes.ArtifactStatus;
export type ArtifactKind = 'text' | 'json' | 'verification' | 'pull_request';

/** A `text` artifact's content. */
export interface TextContent {
  format: 'markdown' | 'plain';
  content: string;
}

/** A `verification` artifact's content: one round of checks. */
export interface VerificationContent {
  round: number;
  results: ApiTypes.CriterionResult[];
}

/**
 * A `pull_request` artifact's content (docs/git.md): pushed commits as a
 * pull request to be. `pullRequest` is set when delivery opened it, and
 * follows its state on GitHub: the one part that changes.
 */
export interface PullRequestContent {
  linkId: string;
  repository: string;
  branch: string;
  baseBranch: string;
  headSha: string;
  description: string;
  pullRequest: {
    number: number;
    url: string;
    state: 'open' | 'merged' | 'closed';
  } | null;
}

/** The decision on a draft (docs/tasks.md, Request changes). */
export type ArtifactReview = ApiTypes.ArtifactReview;

/** A `json` artifact's content. */
export interface JsonContent {
  schema: string | null;
  content: unknown;
}

/**
 * Something a task produced (docs/tasks.md, Artifacts), recorded by the
 * agent during an execution. Its content never changes; its status does.
 */
@Entity({ name: 'artifacts' })
@Check(
  'ck_artifacts_status',
  `status IN ('pending', 'draft', 'final', 'rejected', 'changes_requested', 'partial')`,
)
@Check(
  'ck_artifacts_kind',
  `kind IN ('text', 'json', 'verification', 'pull_request')`,
)
// A task's artifacts in order (keyset pagination).
@Index('ix_artifacts_task_id_created_at_id', ['taskId', 'createdAt', 'id'])
@Index('ix_artifacts_execution_id', ['executionId'])
// At most one primary artifact per execution (one per review round).
@Index('uq_artifacts_primary_execution_id', ['executionId'], {
  unique: true,
  where: `"primary" AND status IN ('final', 'draft')`,
})
// A task's drafts, and what was sent back (reviews).
@Index('ix_artifacts_task_id_status', ['taskId', 'status'])
export class ArtifactEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid' })
  taskId: string;

  @Column({ type: 'uuid' })
  executionId: string;

  /** Copied from the task, so artifacts can be evaluated per version. */
  @Column({ type: 'uuid' })
  agentVersionId: string;

  @Column({ type: 'text' })
  kind: ArtifactKind;

  @Column({ type: 'text' })
  status: ArtifactStatus;

  @Column({ type: 'boolean' })
  primary: boolean;

  /** For a revised draft (reviews, later): the artifact it replaces. */
  @Column({ type: 'uuid', nullable: true })
  revisionOf: string | null;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'jsonb' })
  metadata: Record<string, string>;

  /** The kind's own fields (`TextContent`, `JsonContent`). */
  @Column({ type: 'jsonb' })
  body: TextContent | JsonContent | VerificationContent | PullRequestContent;

  /** Set when someone decided on it as a draft. */
  @Column({ type: 'jsonb', nullable: true })
  review: ArtifactReview | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;

  /** Incremented on every change; the `aggregateVersion` of its events. */
  @Column({ type: 'integer' })
  version: number;
}
