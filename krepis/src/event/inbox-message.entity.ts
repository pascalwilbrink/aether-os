import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * An event this service has handled, so a redelivery is skipped (delivery
 * is at least once). Written in the same transaction as the handlers'
 * changes. Services that subscribe create the `inbox` table with a migration
 * of their own (`InboxMessageEntity` in their data source).
 */
@Entity({ name: 'inbox' })
export class InboxMessageEntity {
  @PrimaryColumn({ type: 'uuid' })
  eventId: string;

  /** The producing service. */
  @Column({ type: 'text' })
  source: string;

  @Column({ type: 'text' })
  eventType: string;

  @Column({ type: 'timestamptz' })
  receivedAt: Date;
}
