import { Injectable } from '@nestjs/common';

import { DomainEvents, type DomainEvent } from '@aether-os/krepis';

import type { PylonEventPayloads, PylonEventType } from './pylon-events.js';

export interface PylonEvent<T extends PylonEventType> {
  eventType: T;
  aggregateId: string;
  aggregateVersion: number;
  organizationId: string;
  projectId?: string | null;
  payload: PylonEventPayloads[T];
}

/**
 * Krepis's `DomainEvents`, typed with Pylon's event catalogue, so a service
 * can't emit an unknown event type or the wrong payload. Call it inside the
 * transaction of the change (the event goes to the outbox with it).
 */
@Injectable()
export class PylonEvents {
  constructor(private readonly events: DomainEvents) {}

  emit<T extends PylonEventType>(
    event: PylonEvent<T>,
  ): Promise<DomainEvent<PylonEventPayloads[T]>> {
    return this.events.emit(event);
  }
}
