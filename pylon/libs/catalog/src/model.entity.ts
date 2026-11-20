import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@pylon/core';

export type ModelStatus = ApiTypes.ModelStatus;
export type ModelKind = ApiTypes.ModelKind;

/**
 * A model in the platform's catalogue (docs/models.md, Models): what agent
 * versions can name (`provider` / `model`, the provider's API ID) and what
 * the gateway prices calls with (`model_prices`).
 */
@Entity({ name: 'models' })
@Check('ck_models_status', `status IN ('active', 'deprecated', 'retired')`)
@Check('ck_models_kind', `kind IN ('chat', 'embedding')`)
@Index('uq_models_provider_model', ['provider', 'model'], { unique: true })
// Keyset pagination by name, tie-broken by ID.
@Index('ix_models_name_id', ['name', 'id'])
export class ModelEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'text' })
  provider: string;

  @Column({ type: 'text' })
  model: string;

  /** `chat` (the providers' own APIs) or `embedding` (Pylon's embeddings). */
  @Column({ type: 'text', default: 'chat' })
  kind: ModelKind;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  status: ModelStatus;

  @Column({ type: 'integer', nullable: true })
  contextWindow: number | null;

  @Column({ type: 'integer', nullable: true })
  maxOutputTokens: number | null;

  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
