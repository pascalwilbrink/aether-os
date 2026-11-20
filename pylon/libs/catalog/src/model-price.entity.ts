import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@pylon/core';

/**
 * A model's price from `effectiveFrom` until its next one (docs/models.md,
 * Metering: prices are versioned). Never changed once recorded, so the
 * calls priced with it keep their cost. US dollars per million tokens, as
 * decimal strings (Postgres `numeric`).
 */
@Entity({ name: 'model_prices' })
// One price per moment; also the "price in force at" lookup.
@Index(
  'uq_model_prices_model_id_effective_from',
  ['modelId', 'effectiveFrom'],
  {
    unique: true,
  },
)
export class ModelPriceEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  modelId: string;

  @Column({ type: 'timestamptz' })
  effectiveFrom: Date;

  @Column({ type: 'numeric', precision: 12, scale: 6 })
  inputPerMTok: string;

  @Column({ type: 'numeric', precision: 12, scale: 6 })
  outputPerMTok: string;

  /** Null: cache reads cost what other input does. */
  @Column({ type: 'numeric', precision: 12, scale: 6, nullable: true })
  cacheReadPerMTok: string | null;

  /** Null: cache writes cost what other input does. */
  @Column({ type: 'numeric', precision: 12, scale: 6, nullable: true })
  cacheWritePerMTok: string | null;

  /** Higher rates for a call with more input than `aboveInputTokens`. */
  @Column({ type: 'jsonb', nullable: true })
  longContext: ApiTypes.LongContextRates | null;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
