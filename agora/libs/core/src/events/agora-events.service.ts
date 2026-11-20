import { Injectable } from '@nestjs/common';

import { DomainEvents, type DomainEvent } from '@aether-os/krepis';

import type { AgoraEventPayloads, AgoraEventType } from './agora-events.js';

export interface AgoraEvent<T extends AgoraEventType> {
  eventType: T;
  aggregateId: string;
  aggregateVersion: number;
  organizationId: string;
  projectId?: string | null;
  payload: AgoraEventPayloads[T];
}

/**
 * Krepis's `DomainEvents`, typed with Agora's event catalogue, so a service
 * can't emit an unknown event type or the wrong payload. Call it inside the
 * transaction of the change (the event goes to the outbox with it).
 */
@Injectable()
export class AgoraEvents {
  constructor(private readonly events: DomainEvents) {}

  emit<T extends AgoraEventType>(
    event: AgoraEvent<T>,
  ): Promise<DomainEvent<AgoraEventPayloads[T]>> {
    return this.events.emit(event);
  }
}
