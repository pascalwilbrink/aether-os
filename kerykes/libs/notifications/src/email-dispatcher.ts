import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, type Repository } from 'typeorm';

import { Directory } from '@kerykes/directory';

import { emailFor } from './email-content.js';
import { EmailSender } from './email-sender.js';
import {
  EmailDeliveryEntity,
  NotificationEntity,
} from './notification.entities.js';
import {
  NOTIFICATIONS_OPTIONS,
  type NotificationsOptions,
} from './notifications.options.js';
import { NotificationsService } from './notifications.service.js';

/** How long a claimed email is someone's to send, before another instance may try. */
const LEASE_MS = 5 * 60_000;
const BATCH = 20;

/**
 * Sends the waiting emails (docs/notifications.md, Delivery), every
 * `EMAIL_POLL_INTERVAL_MS`, on every instance: each claims a batch by
 * moving its `next_attempt_at` forward (a lease, `FOR UPDATE SKIP LOCKED`),
 * then, per email, checks the recipient may still be told, takes their
 * address from Pistis, and sends it. A failed try waits
 * `EMAIL_RETRY_BACKOFF_MS`, doubled each time, until `EMAIL_MAX_ATTEMPTS`.
 */
@Injectable()
export class EmailDispatcher
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(EmailDispatcher.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<unknown> | null = null;

  constructor(
    @InjectRepository(EmailDeliveryEntity)
    private readonly deliveries: Repository<EmailDeliveryEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
    private readonly notificationsService: NotificationsService,
    private readonly directory: Directory,
    private readonly sender: EmailSender,
    @Inject(NOTIFICATIONS_OPTIONS)
    private readonly options: NotificationsOptions,
  ) {}

  onApplicationBootstrap(): void {
    if (this.options.emailEnabled && this.options.pollIntervalMs > 0) {
      this.timer = setInterval(() => {
        if (!this.running) {
          this.running = this.tick()
            .catch((error: unknown) =>
              this.logger.error(`Sending emails failed: ${String(error)}`),
            )
            .finally(() => (this.running = null));
        }
      }, this.options.pollIntervalMs);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  /** One round: claims what's due and sends it; how many were handled. */
  async tick(now = new Date()): Promise<number> {
    const claimed = await this.claim(now);
    for (const delivery of claimed) {
      await this.deliver(delivery, now);
    }
    return claimed.length;
  }

  private claim(now: Date): Promise<EmailDeliveryEntity[]> {
    return this.deliveries.manager.transaction(async (manager) => {
      const due = await manager.getRepository(EmailDeliveryEntity).find({
        where: { status: 'pending', nextAttemptAt: LessThanOrEqual(now) },
        order: { nextAttemptAt: 'ASC' },
        take: BATCH,
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      });
      if (due.length > 0) {
        await manager.getRepository(EmailDeliveryEntity).update(
          due.map((delivery) => delivery.notificationId),
          { nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
        );
      }
      return due;
    });
  }

  private async deliver(
    delivery: EmailDeliveryEntity,
    now: Date,
  ): Promise<void> {
    const notification = await this.notifications.findOneBy({
      id: delivery.notificationId,
    });
    if (!notification) {
      return this.finish(delivery, 'skipped', 'the notification is gone');
    }
    try {
      if (!(await this.notificationsService.mayReceive(notification))) {
        return this.finish(delivery, 'skipped', 'no longer has access');
      }
      const user = await this.directory.user(notification.recipient);
      if (!user || user.status !== 'active') {
        return this.finish(delivery, 'skipped', 'not an active user');
      }
      if (!user.email) {
        return this.finish(delivery, 'skipped', 'no email address');
      }
      await this.sender.send(
        emailFor(notification, user.email, this.options.irisUrl),
      );
      await this.deliveries.update(delivery.notificationId, {
        status: 'sent',
        attempts: delivery.attempts + 1,
        reason: null,
        sentAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      const attempts = delivery.attempts + 1;
      const reason = error instanceof Error ? error.message : String(error);
      if (attempts >= this.options.maxAttempts) {
        this.logger.warn(
          `Email for notification ${delivery.notificationId} failed for good: ${reason}`,
        );
        await this.deliveries.update(delivery.notificationId, {
          status: 'failed',
          attempts,
          reason,
          updatedAt: new Date(),
        });
        return;
      }
      await this.deliveries.update(delivery.notificationId, {
        attempts,
        reason,
        nextAttemptAt: new Date(
          now.getTime() + this.options.backoffMs * 2 ** (attempts - 1),
        ),
        updatedAt: new Date(),
      });
    }
  }

  private async finish(
    delivery: EmailDeliveryEntity,
    status: 'skipped',
    reason: string,
  ): Promise<void> {
    await this.deliveries.update(delivery.notificationId, {
      status,
      reason,
      updatedAt: new Date(),
    });
  }
}
