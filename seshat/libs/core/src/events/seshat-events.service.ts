import { Injectable } from '@nestjs/common';

import { DomainEvents, type DomainEvent } from '@aether-os/krepis';

import type { SeshatEventPayloads, SeshatEventType } from './seshat-events.js';

export interface SeshatEvent<T extends SeshatEventType> {
  eventType: T;
  aggregateId: string;
  aggregateVersion: number;
  organizationId: string;
  projectId?: string | null;
  payload: SeshatEventPayloads[T];
}

/**
 * Krepis's `DomainEvents`, typed with Seshat's event catalogue, so a service
 * can't emit an unknown event type or the wrong payload. Call it inside the
 * transaction of the change (the event goes to the outbox with it).
 */
@Injectable()
export class SeshatEvents {
  constructor(private readonly events: DomainEvents) {}

  emit<T extends SeshatEventType>(
    event: SeshatEvent<T>,
  ): Promise<DomainEvent<SeshatEventPayloads[T]>> {
    return this.events.emit(event);
  }
}
