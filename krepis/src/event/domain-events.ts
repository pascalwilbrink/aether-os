import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { Propagation, Transactional } from 'typeorm-transactional';
import { v7 as uuidv7 } from 'uuid';

import { currentTraceContext } from '../telemetry/trace-context.js';
import type { DomainEvent, NewDomainEvent } from './domain-event.js';
import { EVENTS_OPTIONS, type EventsOptions } from './events.options.js';
import { OutboxMessageEntity } from './outbox-message.entity.js';

/**
 * How services emit events (docs/engineering.md, Events in code). `emit`
 * must run inside the transaction of the change it describes:
 *
 * 1. Events listed in `publish` are written to the outbox in that
 *    transaction, so they're stored if and only if the change commits; the
 *    relay publishes them afterwards.
 *    The current trace context (`traceparent`, `tracestate`) is stored with
 *    it and published as AMQP headers.
 * 2. The event is emitted locally as `<service>.<eventType>` and awaited, so
 *    local handlers that only touch this service's database run in the same
 *    transaction (and roll it back if they fail; handle them with
 *    `@OnDomainEvent`, which lets errors through).
 *
 * Calling it outside a transaction is an error.
 */
@Injectable()
export class DomainEvents {
  private readonly published: ReadonlySet<string>;

  constructor(
    @Inject(EVENTS_OPTIONS) private readonly options: EventsOptions,
    private readonly emitter: EventEmitter2,
    @InjectRepository(OutboxMessageEntity)
    private readonly outbox: Repository<OutboxMessageEntity>,
  ) {
    this.published = new Set(options.publish);
  }

  @Transactional({ propagation: Propagation.MANDATORY })
  async emit<TPayload>(
    input: NewDomainEvent<TPayload>,
  ): Promise<DomainEvent<TPayload>> {
    const event: DomainEvent<TPayload> = {
      eventId: uuidv7(),
      schemaVersion: 1,
      occurredAt: new Date(),
      organizationId: null,
      projectId: null,
      actor: null,
      ...input,
    };

    if (this.published.has(event.eventType)) {
      const row: OutboxMessageEntity = {
        id: event.eventId,
        exchange: `${this.options.service}.events`,
        routingKey: event.eventType,
        message: JSON.parse(JSON.stringify(event)) as Record<string, unknown>,
        // Published as AMQP headers, so consumers continue the trace.
        headers: { ...currentTraceContext() },
        createdAt: event.occurredAt,
        publishedAt: null,
        attempts: 0,
        lastError: null,
      };
      await this.outbox.insert(
        row as Parameters<Repository<OutboxMessageEntity>['insert']>[0],
      );
    }

    await this.emitter.emitAsync(
      `${this.options.service}.${event.eventType}`,
      event,
    );

    return event;
  }
}
