import { Injectable } from '@nestjs/common';

import { OnDomainEvent, type DomainEvent } from '@kerykes/core';

import { NotificationsService } from './notifications.service.js';

/**
 * The events that need people (docs/notifications.md, Notifications), into
 * notifications, in the inbox's transaction: a failure (Polis or Pistis
 * unreachable) rolls it back and the event is retried.
 */
@Injectable()
export class EventsListener {
  constructor(private readonly notifications: NotificationsService) {}

  @OnDomainEvent('hephaestus.task.awaiting-review')
  @OnDomainEvent('hephaestus.task.failed')
  @OnDomainEvent('hephaestus.task.succeeded')
  @OnDomainEvent('hephaestus.task.paused')
  @OnDomainEvent('hephaestus.council-plan.proposed')
  async onHephaestusEvent(event: DomainEvent<unknown>): Promise<void> {
    await this.notifications.notify('hephaestus', event);
  }

  @OnDomainEvent('pylon.budget.threshold-reached')
  async onPylonEvent(event: DomainEvent<unknown>): Promise<void> {
    await this.notifications.notify('pylon', event);
  }

  @OnDomainEvent('polis.membership.granted')
  @OnDomainEvent('polis.project-membership.granted')
  async onPolisEvent(event: DomainEvent<unknown>): Promise<void> {
    await this.notifications.notify('polis', event);
  }
}
