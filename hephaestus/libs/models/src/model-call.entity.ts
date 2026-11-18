import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type KeySource = 'organization' | 'platform';

/**
 * One call to a model provider through the gateway (docs/models.md,
 * Metering), attributed to the task, execution, agent version, project and
 * organization. Append-only.
 */
@Entity({ name: 'model_calls' })
@Check(
  'ck_model_calls_key_source',
  `key_source IN ('organization', 'platform')`,
)
@Index('ix_model_calls_execution_id', ['executionId'])
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

  /** As the provider reported them; null when it didn't. */
  @Column({ type: 'integer', nullable: true })
  inputTokens: number | null;

  @Column({ type: 'integer', nullable: true })
  outputTokens: number | null;

  /** Null until there's a price catalogue (docs/models.md, Models). */
  @Column({ type: 'numeric', precision: 14, scale: 6, nullable: true })
  costUsd: string | null;

  @Column({ type: 'text', nullable: true })
  finishReason: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
