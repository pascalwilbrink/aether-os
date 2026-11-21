import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import { isUniqueViolation, type ApiTypes } from '@proxenos/core';
import { GitHubApp, GitHubNotConfiguredError } from '@proxenos/github';

import {
  InstallationsService,
  PullRequestsService,
  type GitHubPullRequestPayload,
} from '@proxenos/installations';

import {
  IssueEventsService,
  type GitHubIssuePayload,
} from './issue-events.service.js';
import {
  PushEventsService,
  type GitHubPushPayload,
} from './push-events.service.js';
import { WebhookDeliveryEntity } from './webhook-delivery.entity.js';

export interface GitHubDelivery {
  event: string;
  deliveryId: string;
  signature: string;
  /** Exactly the bytes GitHub signed. */
  rawBody: Buffer;
}

/**
 * GitHub's webhook deliveries (docs/git.md, Webhooks): verified before
 * anything else, stored once (GitHub redelivers), then handled.
 * Installation events keep installations and repositories in step, pull
 * request events the pull requests, and issues and their comments become
 * events for Kairos (`IssueEventsService`); others are only stored. Each
 * delivery records its installation's organization, so its members (and
 * Kairos) can read its payload. A delivery whose
 * handling failed (GitHub unreachable during a sync) keeps the error and
 * is still acknowledged: GitHub doesn't redeliver on its own, and a sync
 * (`POST …/installations/{id}/sync`) catches up.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(WebhookDeliveryEntity)
    private readonly deliveries: Repository<WebhookDeliveryEntity>,
    private readonly installations: InstallationsService,
    private readonly pullRequests: PullRequestsService,
    private readonly issueEvents: IssueEventsService,
    private readonly pushEvents: PushEventsService,
    private readonly github: GitHubApp,
  ) {}

  /** A delivery of the organization's, with its payload (404 otherwise). */
  async findById(
    organizationId: string,
    id: string,
  ): Promise<ApiTypes.WebhookDeliveryResponse> {
    const entity = await this.deliveries.findOneBy({ id, organizationId });
    if (!entity?.organizationId) {
      throw new NotFoundException(`Webhook delivery ${id} not found`);
    }
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      deliveryId: entity.deliveryId,
      event: entity.event,
      action: entity.action,
      receivedAt: entity.receivedAt.toISOString(),
      payload: entity.payload,
    };
  }

  async receive(delivery: GitHubDelivery): Promise<void> {
    if (!this.github.configured) {
      throw new GitHubNotConfiguredError();
    }
    if (
      !(await this.github.verifyWebhook(delivery.rawBody, delivery.signature))
    ) {
      throw new UnauthorizedException('The webhook signature is not valid');
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(delivery.rawBody.toString('utf8')) as Record<
        string,
        unknown
      >;
    } catch {
      throw new UnauthorizedException('The webhook body is not JSON');
    }
    const entity = Object.assign(new WebhookDeliveryEntity(), {
      id: uuidv7(),
      provider: 'github',
      organizationId: null,
      deliveryId: delivery.deliveryId,
      event: delivery.event,
      action: typeof payload.action === 'string' ? payload.action : null,
      payload,
      receivedAt: new Date(),
      processedAt: null,
      error: null,
    } satisfies WebhookDeliveryEntity);
    try {
      await this.deliveries.save(entity, { reload: false });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return; // A redelivery: handled (or tried) already.
      }
      throw error;
    }

    try {
      await this.handle(entity, payload);
      await this.deliveries.update(entity.id, { processedAt: new Date() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Webhook ${delivery.deliveryId} (${delivery.event}) failed: ${message}`,
      );
      await this.deliveries.update(entity.id, { error: message });
    }
  }

  private async handle(
    delivery: WebhookDeliveryEntity,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { event, action } = delivery;
    const installation = payload.installation as { id?: number } | undefined;
    if (installation?.id === undefined) {
      return;
    }
    const externalId = String(installation.id);
    const connected = await this.installations.findByExternalId(externalId);
    if (connected) {
      await this.deliveries.update(delivery.id, {
        organizationId: connected.organizationId,
      });
    }
    if (event === 'installation') {
      switch (action) {
        case 'deleted':
          await this.installations.deleteByExternalId(externalId);
          return;
        case 'suspend':
          await this.installations.suspendByExternalId(externalId);
          return;
        default:
          // unsuspend, new_permissions_accepted, created (recorded on setup).
          await this.installations.syncByExternalId(externalId);
          return;
      }
    }
    if (event === 'installation_repositories') {
      await this.installations.syncByExternalId(externalId);
    }
    if (event === 'pull_request') {
      await this.pullRequests.received(payload as GitHubPullRequestPayload);
    }
    if (event === 'push') {
      await this.pushEvents.received(delivery, payload as GitHubPushPayload);
    }
    if (this.issueEvents.eventTypeOf(event, action)) {
      await this.issueEvents.received(delivery, payload as GitHubIssuePayload);
    }
  }
}
