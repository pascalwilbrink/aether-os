import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import { EventInbox, type DomainEvent, type PistisEvents } from '@polis/core';

import { createApp } from './app.js';

type UserCreated = PistisEvents.PistisEventPayloads['user.created'];
type UserEventType =
  'user.created' | 'user.updated' | 'user.disabled' | 'user.enabled';

describe("Pistis's users (e2e)", () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const userEvent = (
    eventType: UserEventType,
    version: number,
    payload: UserCreated,
  ): DomainEvent<UserCreated> => ({
    eventId: uuidv7(),
    eventType,
    schemaVersion: 1,
    aggregateId: payload.userId,
    aggregateVersion: version,
    occurredAt: new Date('2026-11-25T09:00:00.000Z'),
    organizationId: null,
    projectId: null,
    actor: null,
    payload,
  });
  const userCreated = (payload: UserCreated) =>
    userEvent('user.created', 1, payload);

  const users = () =>
    app
      .get(DataSource)
      .query(
        'SELECT id, display_name, email, status, created_at, version FROM users ORDER BY id',
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
        version: 1,
      },
    ]);
  });

  it("follows a user's changes in version order, whatever order they arrive in", async () => {
    const userId = uuidv7();
    const ada = (fields: Partial<UserCreated> = {}): UserCreated => ({
      userId,
      displayName: 'Ada',
      email: 'ada@example.com',
      status: 'active',
      ...fields,
    });
    const inbox = app.get(EventInbox);
    const copy = async () => {
      const [row] = await users();
      return row
        ? {
            displayName: row.display_name,
            email: row.email,
            status: row.status,
            version: row.version,
          }
        : null;
    };

    // The disabling (version 3) arrives before the update (version 2) and
    // even before the creation: the copy is the newest it has seen.
    await inbox.receive(
      'pistis',
      userEvent(
        'user.disabled',
        3,
        ada({ displayName: 'Ada L.', status: 'disabled' }),
      ),
    );
    expect(await copy()).toEqual({
      displayName: 'Ada L.',
      email: 'ada@example.com',
      status: 'disabled',
      version: 3,
    });
    await inbox.receive(
      'pistis',
      userEvent('user.updated', 2, ada({ displayName: 'Ada L.' })),
    );
    await inbox.receive('pistis', userCreated(ada()));
    expect((await copy())?.version).toBe(3);

    await inbox.receive(
      'pistis',
      userEvent('user.enabled', 4, ada({ displayName: 'Ada L.' })),
    );
    await inbox.receive(
      'pistis',
      userEvent(
        'user.updated',
        5,
        ada({ displayName: 'Ada L.', email: 'ada@example.org' }),
      ),
    );
    expect(await copy()).toEqual({
      displayName: 'Ada L.',
      email: 'ada@example.org',
      status: 'active',
      version: 5,
    });
    // Pistis's backfill re-sends the same version: nothing changes.
    await inbox.receive(
      'pistis',
      userEvent('user.updated', 5, ada({ displayName: 'Stale' })),
    );
    expect((await copy())?.displayName).toBe('Ada L.');
  });
});
