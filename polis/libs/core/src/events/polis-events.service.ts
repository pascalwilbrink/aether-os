import { Injectable } from '@nestjs/common';

import { DomainEvents, type DomainEvent } from '@aether-os/krepis';

import type { PolisEventPayloads, PolisEventType } from './polis-events.js';

export interface PolisEvent<T extends PolisEventType> {
  eventType: T;
  aggregateId: string;
  aggregateVersion: number;
  organizationId: string;
  projectId?: string | null;
  payload: PolisEventPayloads[T];
}

/**
 * Krepis's `DomainEvents`, typed with Polis's event catalogue, so a service
 * can't emit an unknown event type or the wrong payload. Call it inside the
 * transaction of the change (the event goes to the outbox with it).
 */
@Injectable()
export class PolisEvents {
  constructor(private readonly events: DomainEvents) {}

  emit<T extends PolisEventType>(
    event: PolisEvent<T>,
  ): Promise<DomainEvent<PolisEventPayloads[T]>> {
    return this.events.emit(event);
  }
}
