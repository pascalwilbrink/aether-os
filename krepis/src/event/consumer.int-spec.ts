import 'reflect-metadata';

import { randomUUID } from 'node:crypto';

import { Injectable, type INestApplicationContext } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import amqp from 'amqplib';
import {
  Column,
  DataSource,
  Entity,
  PrimaryColumn,
  type Repository,
} from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { inject } from 'vitest';

import { postgresOptions } from '../database/postgres.js';
import { createTransactionalDataSource } from '../database/transactional.js';
import { currentTraceContext } from '../telemetry/trace-context.js';
import type { DomainEvent } from './domain-event.js';
import { EventConsumer } from './event-consumer.js';
import { EventsModule } from './events.module.js';
import { InboxMessageEntity } from './inbox-message.entity.js';
import { OnDomainEvent } from './on-domain-event.js';
import { OutboxMessageEntity } from './outbox-message.entity.js';

@Entity({ name: 'seen_things' })
class SeenThingEntity {
  @PrimaryColumn({ type: 'uuid' })
  eventId: string;

  @Column({ type: 'text' })
  name: string;
}

const failures = { remaining: 0 };

@Injectable()
class ThingHandlers {
  readonly traces: (string | null)[] = [];

  constructor(
    @InjectRepository(SeenThingEntity)
    private readonly seen: Repository<SeenThingEntity>,
  ) {}

  @OnDomainEvent('producer.thing.created')
  async onCreated(event: DomainEvent<{ name: string }>): Promise<void> {
    this.traces.push(currentTraceContext()?.traceparent ?? null);
    await this.seen.insert({
      eventId: event.eventId,
      name: event.payload.name,
    });
    if (failures.remaining > 0) {
      failures.remaining--;
      throw new Error('handler failed');
    }
  }
}

describe('Event consumer (Postgres + RabbitMQ)', () => {
  let app: INestApplicationContext;
  let handlers: ThingHandlers;
  let connection: amqp.ChannelModel;
  let channel: amqp.Channel;
  let queue: string;

  beforeEach(async () => {
    failures.remaining = 0;
    // A fresh consumer (and so fresh queues) per test.
    const service = `consumer-${randomUUID().slice(0, 8)}`;
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRootAsync({
          useFactory: () => ({
            ...postgresOptions({
              url: inject('databaseUrl'),
              entities: [
                SeenThingEntity,
                InboxMessageEntity,
                OutboxMessageEntity,
              ],
            }),
            synchronize: true,
            dropSchema: true,
          }),
          dataSourceFactory: async (options) =>
            createTransactionalDataSource(options!),
        }),
        TypeOrmModule.forFeature([SeenThingEntity]),
        EventsModule.forRoot({
          service,
          publish: [],
          subscribe: { producer: ['thing.created'] },
          rabbitmq: {
            useFactory: () => ({
              url: inject('rabbitmqUrl'),
              relayIntervalMs: 0,
              maxAttempts: 3,
              retryDelayMs: 50,
            }),
          },
        }),
      ],
      providers: [ThingHandlers],
    }).compile();
    app = await moduleRef.init();
    handlers = app.get(ThingHandlers);
    const consumer = app.get(EventConsumer);
    await consumer.ready();
    queue = consumer.queueFor('producer');

    connection = await amqp.connect(inject('rabbitmqUrl'));
    channel = await connection.createChannel();
  });

  afterEach(async () => {
    await connection.close();
    await app.close();
  });

  function event(eventId = uuidv7()): DomainEvent<{ name: string }> {
    return {
      eventId,
      eventType: 'thing.created',
      schemaVersion: 1,
      aggregateId: randomUUID(),
      aggregateVersion: 1,
      occurredAt: new Date(),
      organizationId: randomUUID(),
      projectId: null,
      actor: null,
      payload: { name: 'one' },
    };
  }

  function publish(body: unknown, headers: Record<string, string> = {}) {
    channel.publish(
      'producer.events',
      'thing.created',
      Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
      { persistent: true, contentType: 'application/json', headers },
    );
  }

  async function seenCount(): Promise<number> {
    const [{ count }] = await app
      .get(DataSource)
      .query('SELECT count(*)::int AS count FROM seen_things');
    return count;
  }

  async function waitFor(check: () => Promise<boolean>, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (!(await check())) {
      if (Date.now() > deadline) {
        throw new Error('Timed out');
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async function queueDepth(name: string): Promise<number> {
    return (await channel.checkQueue(name)).messageCount;
  }

  it('handles each event once, even when delivered twice', async () => {
    const e = event();
    publish(e);
    publish(e);
    publish(event());

    await waitFor(async () => (await seenCount()) === 2);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await seenCount()).toBe(2);
    const [{ count }] = await app
      .get(DataSource)
      .query('SELECT count(*)::int AS count FROM inbox');
    expect(count).toBe(2);
  });

  it('restores the trace context for the handlers', async () => {
    const traceparent =
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    publish(event(), { traceparent });

    await waitFor(async () => handlers.traces.length === 1);
    expect(handlers.traces).toEqual([traceparent]);
  });

  it('retries a failing event with backoff, rolling back each failure', async () => {
    failures.remaining = 2;
    publish(event());

    // Two failures (each rolled back), then the third delivery succeeds.
    await waitFor(async () => (await seenCount()) === 1);
    expect(handlers.traces).toHaveLength(3);
    expect(await queueDepth(`${queue}.dead`)).toBe(0);
  });

  it('dead-letters an event that keeps failing', async () => {
    failures.remaining = 100;
    const e = event();
    publish(e);

    await waitFor(async () => (await queueDepth(`${queue}.dead`)) === 1);
    expect(handlers.traces).toHaveLength(3); // maxAttempts
    expect(await seenCount()).toBe(0);

    const dead = await channel.get(`${queue}.dead`, { noAck: true });
    expect(dead && JSON.parse(dead.content.toString()).eventId).toBe(e.eventId);
    expect(dead && dead.properties.headers).toMatchObject({
      'x-attempt': 3,
      'x-last-error': 'handler failed',
    });
  });

  it('dead-letters a message that is not an event, without retrying', async () => {
    publish('not json');
    publish({ eventType: 'thing.created' });

    await waitFor(async () => (await queueDepth(`${queue}.dead`)) === 2);
    expect(handlers.traces).toHaveLength(0);
  });
});
