import { Injectable } from '@nestjs/common';

import { DomainEvents, type DomainEvent } from '@aether-os/krepis';

import type { ErgonEventPayloads, ErgonEventType } from './ergon-events.js';

export interface ErgonEvent<T extends ErgonEventType> {
  eventType: T;
  aggregateId: string;
  aggregateVersion: number;
  organizationId: string;
  projectId?: string | null;
  payload: ErgonEventPayloads[T];
}

/**
 * Krepis's `DomainEvents`, typed with Ergon's event catalogue, so a service
 * can't emit an unknown event type or the wrong payload. Call it inside the
 * transaction of the change (the event goes to the outbox with it).
 */
@Injectable()
export class ErgonEvents {
  constructor(private readonly events: DomainEvents) {}

  emit<T extends ErgonEventType>(
    event: ErgonEvent<T>,
  ): Promise<DomainEvent<ErgonEventPayloads[T]>> {
    return this.events.emit(event);
  }
}
