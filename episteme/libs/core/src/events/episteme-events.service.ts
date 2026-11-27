import { Injectable } from '@nestjs/common';

import { DomainEvents, type DomainEvent } from '@aether-os/krepis';

import type {
  EpistemeEventPayloads,
  EpistemeEventType,
} from './episteme-events.js';

export interface EpistemeEvent<T extends EpistemeEventType> {
  eventType: T;
  aggregateId: string;
  aggregateVersion: number;
  organizationId: string;
  projectId?: string | null;
  payload: EpistemeEventPayloads[T];
}

/**
 * Krepis's `DomainEvents`, typed with Episteme's event catalogue, so a service
 * can't emit an unknown event type or the wrong payload. Call it inside the
 * transaction of the change (the event goes to the outbox with it).
 */
@Injectable()
export class EpistemeEvents {
  constructor(private readonly events: DomainEvents) {}

  emit<T extends EpistemeEventType>(
    event: EpistemeEvent<T>,
  ): Promise<DomainEvent<EpistemeEventPayloads[T]>> {
    return this.events.emit(event);
  }
}
