import { Injectable } from '@nestjs/common';

import { DomainEvents, type DomainEvent } from '@aether-os/krepis';

import type { PistisEventPayloads, PistisEventType } from './pistis-events.js';

/** Pistis's events concern no organization: users are platform-wide. */
export interface PistisEvent<T extends PistisEventType> {
  eventType: T;
  aggregateId: string;
  aggregateVersion: number;
  payload: PistisEventPayloads[T];
}

/**
 * Krepis's `DomainEvents`, typed with Pistis's event catalogue, so a service
 * can't emit an unknown event type or the wrong payload. Call it inside the
 * transaction of the change (the event goes to the outbox with it).
 */
@Injectable()
export class PistisEvents {
  constructor(private readonly events: DomainEvents) {}

  emit<T extends PistisEventType>(
    event: PistisEvent<T>,
  ): Promise<DomainEvent<PistisEventPayloads[T]>> {
    // organizationId and projectId stay null (Krepis's defaults).
    return this.events.emit(event);
  }
}
