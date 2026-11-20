import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { KeySource } from '@pylon/keys';

/**
 * One call to a model provider through Pylon (docs/models.md, Metering),
 * attributed to whoever made it: the organization and project always; for
 * a task token, the task, its tree, the agent, its version and (when the
 * caller says) the execution. Append-only.
 */
@Entity({ name: 'model_calls' })
@Check(
  'ck_model_calls_key_source',
  `key_source IN ('agent', 'organization', 'platform')`,
)
@Check('ck_model_calls_kind', `kind IN ('chat', 'embedding')`)
@Index('ix_model_calls_execution_id', ['executionId'])
// What budgets sum (docs/models.md): per organization, project and agent
// and month, per task tree.
@Index('ix_model_calls_organization_id_created_at', [
  'organizationId',
  'createdAt',
])
@Index('ix_model_calls_project_id_created_at', ['projectId', 'createdAt'])
@Index('ix_model_calls_agent_id_created_at', ['agentId', 'createdAt'])
@Index('ix_model_calls_task_tree_id', ['taskTreeId'])
export class ModelCallEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  /** The task, for a task token's call; null otherwise (Seshat's embeddings). */
  @Column({ type: 'uuid', nullable: true })
  taskId: string | null;

  /** The task's tree (its top-level task). */
  @Column({ type: 'uuid', nullable: true })
  taskTreeId: string | null;

  @Column({ type: 'uuid', nullable: true })
  agentId: string | null;

  @Column({ type: 'uuid', nullable: true })
  agentVersionId: string | null;

  /** As the caller labelled the call (`X-Aether-Execution-Id`). */
  @Column({ type: 'uuid', nullable: true })
  executionId: string | null;

  /** Who called: the token's `sub`. */
  @Column({ type: 'text' })
  caller: string;

  /** `agent`, `judge`, `summary`, `knowledge`, … (`X-Aether-Purpose`). */
  @Column({ type: 'text' })
  purpose: string;

  @Column({ type: 'text' })
  kind: 'chat' | 'embedding';

  @Column({ type: 'text' })
  provider: string;

  @Column({ type: 'text' })
  model: string;

  /** Whose provider account paid. */
  @Column({ type: 'text' })
  keySource: KeySource;

  /**
   * As the provider reported them; null when it didn't. Input counts every
   * input token, cache reads and writes included.
   */
  @Column({ type: 'integer', nullable: true })
  inputTokens: number | null;

  @Column({ type: 'integer', nullable: true })
  outputTokens: number | null;

  @Column({ type: 'integer', nullable: true })
  cacheReadTokens: number | null;

  @Column({ type: 'integer', nullable: true })
  cacheWriteTokens: number | null;

  /** At `priceId`; null for a model without a price (outside the catalogue). */
  @Column({ type: 'numeric', precision: 14, scale: 6, nullable: true })
  costUsd: string | null;

  /** The catalogue price the cost was computed with (docs/models.md: versioned). */
  @Column({ type: 'uuid', nullable: true })
  priceId: string | null;

  /** How the call ended: the provider's stop reason, `error`, `aborted`. */
  @Column({ type: 'text', nullable: true })
  finishReason: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
