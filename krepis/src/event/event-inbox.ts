import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import type { DomainEvent } from './domain-event.js';
import { InboxMessageEntity } from './inbox-message.entity.js';

/**
 * Receives an event from another service, exactly once per `eventId`: in
 * one transaction it records the event in the inbox and emits it locally as
 * `<source>.<eventType>`, awaiting the handlers. A redelivered event is
 * skipped; a failing handler rolls everything back, so the event can be
 * retried. The RabbitMQ consumer calls it; tests can too.
 */
@Injectable()
export class EventInbox {
  constructor(
    @InjectRepository(InboxMessageEntity)
    private readonly inbox: Repository<InboxMessageEntity>,
    private readonly emitter: EventEmitter2,
  ) {}

  /** Returns false for an event that was already handled. */
  @Transactional()
  async receive(source: string, event: DomainEvent): Promise<boolean> {
    const inserted: unknown[] = (
      await this.inbox
        .createQueryBuilder()
        .insert()
        .values({
          eventId: event.eventId,
          source,
          eventType: event.eventType,
          receivedAt: new Date(),
        })
        .orIgnore()
        .returning('event_id')
        .execute()
    ).raw;
    if (inserted.length === 0) {
      return false;
    }

    await this.emitter.emitAsync(`${source}.${event.eventType}`, event);

    return true;
  }
}
