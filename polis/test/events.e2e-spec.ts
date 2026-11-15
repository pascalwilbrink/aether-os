import type { INestApplication } from '@nestjs/common';
import amqp from 'amqplib';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { inject } from 'vitest';

import { OutboxRelay } from '@polis/core';

import { createApp } from './app.js';

describe('Events (e2e)', () => {
  let app: INestApplication<App>;
  let connection: amqp.ChannelModel;
  let channel: amqp.Channel;
  let queue: string;

  beforeEach(async () => {
    app = await createApp();
    // A consumer's queue on polis.events, as another service would bind it.
    connection = await amqp.connect(inject('rabbitmqUrl'));
    channel = await connection.createChannel();
    await channel.assertExchange('polis.events', 'topic', { durable: true });
    ({ queue } = await channel.assertQueue('', { exclusive: true }));
    await channel.bindQueue(queue, 'polis.events', 'organization.*');
  });

  afterEach(async () => {
    await connection.close();
    await app.close();
  });

  it('publishes an organization change to polis.events', async () => {
    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .send({ name: 'Acme', slug: 'acme', createdBy: 'user-1' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/organizations/${org.body.id}/suspend`)
      .expect(200);

    await expect(app.get(OutboxRelay).relayBatch()).resolves.toBe(2);

    const created = await nextMessage();
    const suspended = await nextMessage();
    expect(created.fields.routingKey).toBe('organization.created');
    expect(JSON.parse(created.content.toString())).toMatchObject({
      eventType: 'organization.created',
      aggregateId: org.body.id,
      aggregateVersion: 1,
      organizationId: org.body.id,
      payload: { organizationId: org.body.id, slug: 'acme' },
    });
    expect(suspended.properties.type).toBe('organization.suspended');

    const [{ waiting }] = await app
      .get(DataSource)
      .query(
        'SELECT count(*)::int AS waiting FROM outbox WHERE published_at IS NULL',
      );
    expect(waiting).toBe(0);
  });

  async function nextMessage(): Promise<amqp.GetMessage> {
    for (let i = 0; i < 50; i++) {
      const message = await channel.get(queue, { noAck: true });
      if (message) {
        return message;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('No message arrived');
  }
});
