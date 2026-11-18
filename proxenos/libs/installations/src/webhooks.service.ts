import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import { isUniqueViolation } from '@proxenos/core';
import { GitHubApp, GitHubNotConfiguredError } from '@proxenos/github';

import { InstallationsService } from './installations.service.js';
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
 * Installation events keep installations and repositories in step; others
 * are only stored for now (Kairos's triggers come later). A delivery whose
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
    private readonly github: GitHubApp,
  ) {}

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
      await this.handle(entity.event, entity.action, payload);
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
    event: string,
    action: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const installation = payload.installation as { id?: number } | undefined;
    if (installation?.id === undefined) {
      return;
    }
    const externalId = String(installation.id);
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
  }
}
