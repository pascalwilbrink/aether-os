import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

/**
 * A verified webhook delivery, stored once (GitHub redelivers: deduplicated
 * on its delivery ID), with what handling it did.
 */
@Entity({ name: 'webhook_deliveries' })
@Unique('uq_webhook_deliveries_provider_delivery_id', [
  'provider',
  'deliveryId',
])
export class WebhookDeliveryEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'text' })
  provider: 'github';

  /** `X-GitHub-Delivery`. */
  @Column({ type: 'text' })
  deliveryId: string;

  /** `X-GitHub-Event`, e.g. `installation`. */
  @Column({ type: 'text' })
  event: string;

  @Column({ type: 'text', nullable: true })
  action: string | null;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'timestamptz' })
  receivedAt: Date;

  /** When handling finished (or null: not handled, see `error`). */
  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;
}
