import { Injectable } from '@nestjs/common';

import { DomainEvents, type DomainEvent } from '@aether-os/krepis';

import type {
  HephaestusEventPayloads,
  HephaestusEventType,
} from './hephaestus-events.js';

export interface HephaestusEvent<T extends HephaestusEventType> {
  eventType: T;
  aggregateId: string;
  aggregateVersion: number;
  organizationId: string;
  projectId?: string | null;
  payload: HephaestusEventPayloads[T];
}

/**
 * Krepis's `DomainEvents`, typed with Hephaestus's event catalogue, so a
 * service can't emit an unknown event type or the wrong payload. Call it
 * inside the transaction of the change (the event goes to the outbox with it).
 */
@Injectable()
export class HephaestusEvents {
  constructor(private readonly events: DomainEvents) {}

  emit<T extends HephaestusEventType>(
    event: HephaestusEvent<T>,
  ): Promise<DomainEvent<HephaestusEventPayloads[T]>> {
    return this.events.emit(event);
  }
}
