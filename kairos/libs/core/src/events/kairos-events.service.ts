import { Injectable } from '@nestjs/common';

import { DomainEvents, type DomainEvent } from '@aether-os/krepis';

import type { KairosEventPayloads, KairosEventType } from './kairos-events.js';

export interface KairosEvent<T extends KairosEventType> {
  eventType: T;
  aggregateId: string;
  aggregateVersion: number;
  organizationId: string;
  projectId?: string | null;
  payload: KairosEventPayloads[T];
}

/**
 * Krepis's `DomainEvents`, typed with Kairos's event catalogue, so a service
 * can't emit an unknown event type or the wrong payload. Call it inside the
 * transaction of the change (the event goes to the outbox with it).
 */
@Injectable()
export class KairosEvents {
  constructor(private readonly events: DomainEvents) {}

  emit<T extends KairosEventType>(
    event: KairosEvent<T>,
  ): Promise<DomainEvent<KairosEventPayloads[T]>> {
    return this.events.emit(event);
  }
}
