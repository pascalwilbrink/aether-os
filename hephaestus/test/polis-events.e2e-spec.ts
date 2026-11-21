import type { INestApplication } from '@nestjs/common';
import amqp from 'amqplib';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { inject } from 'vitest';

import { createApp } from './app.js';
import { asMember } from './auth.js';
import type { FakePolis } from './fake-polis.js';

describe("Polis's events over RabbitMQ (e2e)", () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let connection: amqp.ChannelModel;
  let channel: amqp.Channel;

  beforeEach(async () => {
    ({ app, polis } = await createApp());
    connection = await amqp.connect(inject('rabbitmqUrl'));
    channel = await connection.createChannel();
    // Drop leftovers from earlier tests, so each test sees only its events.
    await channel.purgeQueue('hephaestus.polis-events');
  });

  afterEach(async () => {
    await connection.close();
    await app.close();
  });

  /** Publishes as Polis's outbox relay does. */
  function publishPolisEvent(
    eventType: string,
    organizationId: string,
    aggregateVersion: number,
    traceparent?: string,
  ) {
    const event = {
      eventId: uuidv7(),
      eventType,
      schemaVersion: 1,
      aggregateId: organizationId,
      aggregateVersion,
      occurredAt: new Date().toISOString(),
      organizationId,
      projectId: null,
      actor: null,
      payload: { organizationId, reason: null },
    };
    channel.publish(
      'polis.events',
      eventType,
      Buffer.from(JSON.stringify(event)),
      {
        messageId: event.eventId,
        type: eventType,
        contentType: 'application/json',
        persistent: true,
        headers: traceparent ? { traceparent } : {},
      },
    );
  }

  async function waitFor(check: () => Promise<boolean>) {
    const deadline = Date.now() + 10_000;
    while (!(await check())) {
      if (Date.now() > deadline) {
        throw new Error('Timed out');
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  it('suspends an organization when Polis says so, and reactivates it', async () => {
    const orgId = polis.organization();
    // Any write in the organization; registering a tool server is one.
    const servers = `/v1/organizations/${orgId}/tool-servers`;
    const server = (name: string) => ({
      name,
      url: 'https://tools.example.com/mcp',
      auth: { type: 'none' },
    });
    const owner = await asMember(app, orgId, ['owner']);
    const http = () => owner;
    await http().post(servers).send(server('a')).expect(201);

    publishPolisEvent('organization.suspended', orgId, 2);
    await waitFor(async () => {
      const res = await http().post(servers).send(server('b'));
      return res.status === 409 && res.body.code === 'ORGANIZATION_SUSPENDED';
    });

    publishPolisEvent('organization.reactivated', orgId, 3);
    await waitFor(async () => {
      const res = await http().post(servers).send(server('c'));
      return res.status === 201;
    });
  });

  it('records each consumed event in the inbox', async () => {
    const orgId = polis.organization();
    publishPolisEvent('organization.created', orgId, 1);

    await waitFor(async () => {
      const [{ count }] = await app
        .get(DataSource)
        .query(
          `SELECT count(*)::int AS count FROM inbox WHERE source = 'polis' AND event_type = 'organization.created'`,
        );
      return count === 1;
    });
    const [state] = await app
      .get(DataSource)
      .query('SELECT status, version FROM organization_states WHERE id = $1', [
        orgId,
      ]);
    expect(state).toEqual({ status: 'active', version: 1 });
    expect(polis.calls).toBe(0);
  });
});
