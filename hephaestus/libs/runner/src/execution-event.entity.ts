import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@hephaestus/core';

export type ExecutionEventType = ApiTypes.ExecutionEventType;
export type ExecutionEventLevel = ApiTypes.ExecutionEvent['level'];

/**
 * One thing an execution did (docs/tasks.md, Activity): a step of the
 * runner, a model call or a tool call, numbered within the execution. Its
 * text is redacted and shortened before it's kept.
 */
@Entity({ name: 'execution_events' })
@Check('ck_execution_events_type', `type IN ('log', 'model_call', 'tool_call')`)
@Check('ck_execution_events_level', `level IN ('info', 'warn', 'error')`)
@Index(
  'uq_execution_events_execution_id_sequence',
  ['executionId', 'sequence'],
  {
    unique: true,
  },
)
export class ExecutionEventEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  executionId: string;

  @Column({ type: 'integer' })
  sequence: number;

  @Column({ type: 'text' })
  type: ExecutionEventType;

  @Column({ type: 'text' })
  level: ExecutionEventLevel;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'text', nullable: true })
  toolName: string | null;

  @Column({ type: 'text', nullable: true })
  input: string | null;

  @Column({ type: 'text', nullable: true })
  output: string | null;

  @Column({ type: 'text', nullable: true })
  text: string | null;

  @Column({ type: 'integer', nullable: true })
  inputTokens: number | null;

  @Column({ type: 'integer', nullable: true })
  outputTokens: number | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
