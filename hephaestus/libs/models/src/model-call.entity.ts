import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type KeySource = 'agent' | 'organization' | 'platform';

/**
 * One call to a model provider through the gateway (docs/models.md,
 * Metering), attributed to the task, execution, agent version, project and
 * organization. Append-only.
 */
@Entity({ name: 'model_calls' })
@Check(
  'ck_model_calls_key_source',
  `key_source IN ('agent', 'organization', 'platform')`,
)
@Index('ix_model_calls_execution_id', ['executionId'])
// What budgets sum (docs/models.md): per project and month, per task tree.
@Index('ix_model_calls_project_id_created_at', ['projectId', 'createdAt'])
@Index('ix_model_calls_top_level_task_id', ['topLevelTaskId'])
@Index('ix_model_calls_agent_id_created_at', ['agentId', 'createdAt'])
// Usage per organization over time (budgets, later).
@Index('ix_model_calls_organization_id_created_at', [
  'organizationId',
  'createdAt',
])
export class ModelCallEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid' })
  taskId: string;

  /** Null for calls recorded before task trees were tracked. */
  @Column({ type: 'uuid', nullable: true })
  topLevelTaskId: string | null;

  /** Null for calls recorded before agents had budgets. */
  @Column({ type: 'uuid', nullable: true })
  agentId: string | null;

  @Column({ type: 'uuid' })
  executionId: string;

  @Column({ type: 'uuid' })
  agentVersionId: string;

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

  @Column({ type: 'text', nullable: true })
  finishReason: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
