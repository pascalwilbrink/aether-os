import 'reflect-metadata';

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
import { runInTransaction, Transactional } from 'typeorm-transactional';
import { inject } from 'vitest';

import { postgresOptions } from '../database/postgres.js';
import { createTransactionalDataSource } from '../database/transactional.js';
import type { DomainEvent } from './domain-event.js';
import { DomainEvents } from './domain-events.js';
import { EventsModule } from './events.module.js';
import { runWithTraceContext } from '../telemetry/trace-context.js';
import { OnDomainEvent } from './on-domain-event.js';
import { MessagePublisher } from './message-publisher.js';
import { OutboxRelay } from './outbox-relay.js';
import { OutboxMessageEntity } from './outbox-message.entity.js';

@Entity({ name: 'things' })
class ThingEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'text' })
  name: string;
}

const ORG = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

@Injectable()
class ThingsService {
  readonly seen: DomainEvent[] = [];

  constructor(
    @InjectRepository(ThingEntity)
    private readonly things: Repository<ThingEntity>,
    private readonly events: DomainEvents,
  ) {}

  @Transactional()
  async create(id: string, name: string, fail = false): Promise<void> {
    await this.things.insert({ id, name });
    await this.events.emit({
      eventType: 'thing.created',
      aggregateId: id,
      aggregateVersion: 1,
      organizationId: ORG,
      payload: { thingId: id, name },
    });
    await this.events.emit({
      eventType: 'thing.noted',
      aggregateId: id,
      aggregateVersion: 1,
      payload: {},
    });
    if (fail) {
      throw new Error('boom');
    }
  }

  @OnDomainEvent('test.thing.created')
  onCreated(event: DomainEvent): void {
    this.seen.push(event);
  }
}

describe('Outbox (Postgres + RabbitMQ)', () => {
  let app: INestApplicationContext;
  let things: ThingsService;
  let relay: OutboxRelay;
  let outbox: Repository<OutboxMessageEntity>;

  async function start(publisher?: MessagePublisher) {
    const builder = Test.createTestingModule({
      imports: [
        TypeOrmModule.forRootAsync({
          useFactory: () => ({
            ...postgresOptions({
              url: inject('databaseUrl'),
              entities: [ThingEntity, OutboxMessageEntity],
            }),
            synchronize: true,
            dropSchema: true,
          }),
          dataSourceFactory: async (options) =>
            createTransactionalDataSource(options!),
        }),
        TypeOrmModule.forFeature([ThingEntity]),
        EventsModule.forRoot({
          service: 'test',
          publish: ['thing.created'],
          send: { receiver: ['thing.do'] },
          rabbitmq: {
            useFactory: () => ({
              url: inject('rabbitmqUrl'),
              relayIntervalMs: 0,
            }),
          },
        }),
      ],
      providers: [ThingsService],
    });
    if (publisher) {
      builder.overrideProvider(MessagePublisher).useValue(publisher);
    }
    app = await (await builder.compile()).init();
    things = app.get(ThingsService);
    relay = app.get(OutboxRelay);
    outbox = app.get(DataSource).getRepository(OutboxMessageEntity);
  }

  afterEach(async () => {
    await app?.close();
  });

  it('stores published events with the change, and emits them locally', async () => {
    await start();
    const id = '0193a1b2-c3d4-7e5f-8a9b-000000000001';

    await things.create(id, 'one');

    const rows = await outbox.find();
    expect(rows).toHaveLength(1); // thing.noted stays in-process
    expect(rows[0]).toMatchObject({
      exchange: 'test.events',
      routingKey: 'thing.created',
      publishedAt: null,
      attempts: 0,
      message: {
        eventType: 'thing.created',
        schemaVersion: 1,
        aggregateId: id,
        aggregateVersion: 1,
        organizationId: ORG,
        projectId: null,
        actor: null,
        payload: { thingId: id, name: 'one' },
      },
    });
    expect(rows[0].message.eventId).toBe(rows[0].id);
    expect(things.seen.map((e) => e.eventId)).toEqual([rows[0].id]);
    expect(rows[0].headers).toEqual({}); // not in a trace
  });

  it('stores nothing when the change rolls back', async () => {
    await start();

    await expect(
      things.create('0193a1b2-c3d4-7e5f-8a9b-000000000002', 'two', true),
    ).rejects.toThrow('boom');

    expect(await outbox.count()).toBe(0);
    expect(await app.get(DataSource).getRepository(ThingEntity).count()).toBe(
      0,
    );
  });

  it('refuses to emit outside a transaction', async () => {
    await start();

    await expect(
      app.get(DomainEvents).emit({
        eventType: 'thing.created',
        aggregateId: 'x',
        aggregateVersion: 1,
        payload: {},
      }),
    ).rejects.toThrow();
  });

  it('relays events to the topic exchange, once', async () => {
    await start();
    const connection = await amqp.connect(inject('rabbitmqUrl'));
    const channel = await connection.createChannel();
    await channel.assertExchange('test.events', 'topic', { durable: true });
    const { queue } = await channel.assertQueue('', { exclusive: true });
    await channel.bindQueue(queue, 'test.events', 'thing.*');

    const id = '0193a1b2-c3d4-7e5f-8a9b-000000000003';
    const traceparent =
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    await runWithTraceContext({ traceparent, tracestate: 'a=1' }, () =>
      things.create(id, 'three'),
    );
    expect(await relay.relayBatch()).toBe(1);
    expect(await relay.relayBatch()).toBe(0);

    const message = await waitForMessage(channel, queue);
    const row = (await outbox.find())[0];
    expect(row.publishedAt).toBeInstanceOf(Date);
    expect(message.properties).toMatchObject({
      messageId: row.id,
      type: 'thing.created',
      contentType: 'application/json',
      deliveryMode: 2,
    });
    expect(JSON.parse(message.content.toString())).toEqual(row.message);
    // The trace context travels with the event.
    expect(row.headers).toEqual({ traceparent, tracestate: 'a=1' });
    expect(message.properties.headers).toMatchObject({
      traceparent,
      tracestate: 'a=1',
    });

    await connection.close();
  });

  it("sends commands to the receiver's command exchange, as the service", async () => {
    await start();
    const connection = await amqp.connect(inject('rabbitmqUrl'));
    const channel = await connection.createChannel();
    const { queue } = await channel.assertQueue('', { exclusive: true });
    // Declared by the sender at start, before any receiver exists.
    await channel.bindQueue(queue, 'receiver.commands', 'thing.do');

    const eventId = '0193a1b2-c3d4-7e5f-8a9b-000000000009';
    const sent = await runInTransaction(() =>
      app.get(DomainEvents).send('receiver', {
        eventId,
        eventType: 'thing.do',
        aggregateId: eventId,
        aggregateVersion: 1,
        organizationId: ORG,
        payload: { name: 'nine' },
      }),
    );
    expect(sent.actor).toEqual({ sub: 'test', sub_type: 'service' });
    expect(await relay.relayBatch()).toBe(1);

    const message = await waitForMessage(channel, queue);
    expect(JSON.parse(message.content.toString())).toMatchObject({
      eventId,
      eventType: 'thing.do',
      actor: { sub: 'test', sub_type: 'service' },
      payload: { name: 'nine' },
    });
    // Only what `send` lists.
    await expect(
      runInTransaction(() =>
        app.get(DomainEvents).send('receiver', {
          eventType: 'thing.undo',
          aggregateId: eventId,
          aggregateVersion: 1,
          payload: {},
        }),
      ),
    ).rejects.toThrow("doesn't send thing.undo");

    await connection.close();
  });

  it('records failures and retries them on the next run', async () => {
    let fail = true;
    const publish = vi.fn(async () => {
      if (fail) {
        throw new Error('broker unavailable');
      }
    });
    await start({ publish });

    await things.create('0193a1b2-c3d4-7e5f-8a9b-000000000004', 'four');
    expect(await relay.relayBatch()).toBe(0);
    expect((await outbox.find())[0]).toMatchObject({
      attempts: 1,
      lastError: 'broker unavailable',
      publishedAt: null,
    });

    fail = false;
    expect(await relay.relayBatch()).toBe(1);
    expect(publish).toHaveBeenCalledTimes(2);
  });
});

async function waitForMessage(
  channel: amqp.Channel,
  queue: string,
): Promise<amqp.GetMessage> {
  for (let i = 0; i < 50; i++) {
    const message = await channel.get(queue, { noAck: true });
    if (message) {
      return message;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('No message arrived');
}
