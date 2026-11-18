import { Injectable } from '@nestjs/common';

import { DomainEvents, type DomainEvent } from '@aether-os/krepis';

import type {
  ProxenosEventPayloads,
  ProxenosEventType,
} from './proxenos-events.js';

export interface ProxenosEvent<T extends ProxenosEventType> {
  eventType: T;
  aggregateId: string;
  aggregateVersion: number;
  organizationId: string;
  projectId?: string | null;
  payload: ProxenosEventPayloads[T];
}

/**
 * Krepis's `DomainEvents`, typed with Proxenos's event catalogue, so a service
 * can't emit an unknown event type or the wrong payload. Call it inside the
 * transaction of the change (the event goes to the outbox with it).
 */
@Injectable()
export class ProxenosEvents {
  constructor(private readonly events: DomainEvents) {}

  emit<T extends ProxenosEventType>(
    event: ProxenosEvent<T>,
  ): Promise<DomainEvent<ProxenosEventPayloads[T]>> {
    return this.events.emit(event);
  }
}
