import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InstallationsModule } from '@proxenos/installations';
import { RepositoriesModule } from '@proxenos/repositories';

import { IssueEventsService } from './issue-events.service.js';
import { PushEventsService } from './push-events.service.js';
import { WebhookDeliveryEntity } from './webhook-delivery.entity.js';
import {
  WebhookDeliveriesController,
  WebhooksController,
} from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';

/**
 * GitHub's webhooks (docs/git.md, Webhooks): verified, stored once, handled
 * by the libraries they concern (installations, pull requests) and turned
 * into issue events for Kairos. On top of `installations` and
 * `repositories`, since issue events name the repository's projects.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookDeliveryEntity]),
    InstallationsModule,
    RepositoriesModule,
  ],
  controllers: [WebhooksController, WebhookDeliveriesController],
  providers: [WebhooksService, IssueEventsService, PushEventsService],
})
export class WebhooksModule {}
