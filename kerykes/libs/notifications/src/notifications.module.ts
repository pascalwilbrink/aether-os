import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { Env } from '@kerykes/core';
import { DirectoryModule } from '@kerykes/directory';
import { MembershipsModule } from '@kerykes/memberships';

import { EmailDispatcher } from './email-dispatcher.js';
import { EmailSender, NoEmailSender, SmtpEmailSender } from './email-sender.js';
import { EventsListener } from './events.listener.js';
import { InboxService } from './inbox.service.js';
import {
  EmailDeliveryEntity,
  NotificationEntity,
} from './notification.entities.js';
import { NotificationMapper } from './notification.mapper.js';
import { NotificationsController } from './notifications.controller.js';
import {
  NOTIFICATIONS_OPTIONS,
  type NotificationsOptions,
} from './notifications.options.js';
import { NotificationsService } from './notifications.service.js';

/** Notifications: from events to the inbox and email. */
@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationEntity, EmailDeliveryEntity]),
    DirectoryModule,
    MembershipsModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    InboxService,
    NotificationMapper,
    EventsListener,
    EmailDispatcher,
    {
      provide: NOTIFICATIONS_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): NotificationsOptions => ({
        emailEnabled: config.get('EMAIL_DRIVER', { infer: true }) !== 'none',
        irisUrl: config.get('IRIS_URL', { infer: true }),
        from: config.get('EMAIL_FROM', { infer: true }),
        pollIntervalMs: config.get('EMAIL_POLL_INTERVAL_MS', { infer: true }),
        maxAttempts: config.get('EMAIL_MAX_ATTEMPTS', { infer: true }),
        backoffMs: config.get('EMAIL_RETRY_BACKOFF_MS', { infer: true }),
      }),
    },
    {
      provide: EmailSender,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): EmailSender => {
        const url = config.get('SMTP_URL', { infer: true });
        return config.get('EMAIL_DRIVER', { infer: true }) === 'smtp' && url
          ? new SmtpEmailSender(url, config.get('EMAIL_FROM', { infer: true }))
          : new NoEmailSender();
      },
    },
  ],
  exports: [NotificationsService, EmailDispatcher],
})
export class NotificationsModule {}
