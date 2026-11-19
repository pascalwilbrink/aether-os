import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@kerykes/core';

export type NotificationType = ApiTypes.NotificationType;

/**
 * One entry in a user's inbox (docs/notifications.md, In-app): what
 * happened, in Aether-os's own words, and where to look in Iris. One per
 * recipient and `groupKey`, so a redelivered event or a second event about
 * the same thing (a review round, a budget's month) adds nothing.
 */
@Entity('notifications')
@Check(
  'ck_notifications_type',
  `type IN ('review_requested', 'task_failed', 'task_succeeded', 'task_paused', 'budget_threshold', 'membership_granted')`,
)
@Index(
  'uq_notifications_organization_id_recipient_group_key',
  ['organizationId', 'recipient', 'groupKey'],
  { unique: true },
)
@Index('ix_notifications_organization_id_recipient_created_at_id', [
  'organizationId',
  'recipient',
  'createdAt',
  'id',
])
export class NotificationEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  organizationId: string;

  /** The project it's about; null for the organization. */
  @Column('uuid', { nullable: true })
  projectId: string | null;

  /**
   * `projectId`, or the organization's ID for an organization-wide one: the
   * inbox filters on it, as projects the reader may still read plus the
   * organization.
   */
  @Column('uuid')
  scopeId: string;

  /** The user's Pistis `sub`. */
  @Column('text')
  recipient: string;

  @Column('text')
  type: NotificationType;

  @Column('text')
  title: string;

  @Column('text')
  body: string;

  /** A path in Iris (`/orgs/…`). */
  @Column('text')
  link: string;

  @Column('uuid', { nullable: true })
  taskId: string | null;

  @Column('text')
  groupKey: string;

  /** The event it came from. */
  @Column('uuid')
  eventId: string;

  @Column('boolean')
  read: boolean;

  @Column('timestamptz', { nullable: true })
  readAt: Date | null;

  @Column('timestamptz')
  createdAt: Date;
}

export type EmailDeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped';

/**
 * A notification's email (docs/notifications.md, Delivery): sent by
 * `EmailDispatcher`, retried with backoff, given up as `failed`, or
 * `skipped` (no email sending configured, the user has no address, or no
 * longer has access).
 */
@Entity('email_deliveries')
@Check(
  'ck_email_deliveries_status',
  `status IN ('pending', 'sent', 'failed', 'skipped')`,
)
@Index('ix_email_deliveries_due', ['nextAttemptAt'], {
  where: `status = 'pending'`,
})
export class EmailDeliveryEntity {
  @PrimaryColumn('uuid')
  notificationId: string;

  @Column('text')
  status: EmailDeliveryStatus;

  @Column('integer')
  attempts: number;

  /** When it's due; also the lease of a try in progress. */
  @Column('timestamptz')
  nextAttemptAt: Date;

  /** Why it failed or was skipped. */
  @Column('text', { nullable: true })
  reason: string | null;

  @Column('timestamptz', { nullable: true })
  sentAt: Date | null;

  @Column('timestamptz')
  createdAt: Date;

  @Column('timestamptz')
  updatedAt: Date;
}
