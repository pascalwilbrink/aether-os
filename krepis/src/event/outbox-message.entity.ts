import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * One event waiting to be (or already) published: written in the same
 * transaction as the change it describes, published afterwards by the relay.
 * Each service registers it with TypeORM and creates the `outbox` table with
 * a migration of its own (generate it with the entity in the data source).
 */
@Entity({ name: 'outbox' })
@Index('ix_outbox_unpublished_created_at', ['createdAt', 'id'], {
  where: 'published_at IS NULL',
})
export class OutboxMessageEntity {
  /** The event's `eventId`, also the AMQP `messageId`. */
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'text' })
  exchange: string;

  @Column({ type: 'text' })
  routingKey: string;

  /** The whole envelope, as published. */
  @Column({ type: 'jsonb' })
  message: Record<string, unknown>;

  /** AMQP headers: the trace context (`traceparent`, `tracestate`) at emit time. */
  @Column({ type: 'jsonb' })
  headers: Record<string, string>;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'integer' })
  attempts: number;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;
}
