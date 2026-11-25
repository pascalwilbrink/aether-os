import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import { EventInbox, type DomainEvent, type PistisEvents } from '@polis/core';

import { createApp } from './app.js';

type UserCreated = PistisEvents.PistisEventPayloads['user.created'];

describe("Pistis's users (e2e)", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const userCreated = (payload: UserCreated): DomainEvent<UserCreated> => ({
    eventId: uuidv7(),
    eventType: 'user.created',
    schemaVersion: 1,
    aggregateId: payload.userId,
    aggregateVersion: 1,
    occurredAt: new Date('2026-11-25T09:00:00.000Z'),
    organizationId: null,
    projectId: null,
    actor: null,
    payload,
  });

  const users = () =>
    app
      .get(DataSource)
      .query(
        'SELECT id, display_name, email, status, created_at FROM users ORDER BY id',
      );

  it('keeps a copy of every user Pistis creates, once', async () => {
    const userId = uuidv7();
    const event = userCreated({
      userId,
      displayName: 'Ada',
      email: 'ada@example.com',
      status: 'active',
    });
    const inbox = app.get(EventInbox);

    await expect(inbox.receive('pistis', event)).resolves.toBe(true);
    // The same message again (at-least-once delivery): skipped.
    await expect(inbox.receive('pistis', event)).resolves.toBe(false);
    // Another event for the same user changes nothing.
    await inbox.receive(
      'pistis',
      userCreated({
        userId,
        displayName: 'Someone else',
        email: null,
        status: 'active',
      }),
    );

    expect(await users()).toEqual([
      {
        id: userId,
        display_name: 'Ada',
        email: 'ada@example.com',
        status: 'active',
        created_at: new Date('2026-11-25T09:00:00.000Z'),
      },
    ]);
  });
});
