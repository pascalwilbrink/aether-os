import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';

import { TokenSigner } from '@pistis/oidc';

import { createApp, MISSING_ID, operatorAgent, readerAgent } from './app.js';

const googleIdentity = {
  provider: 'google',
  subject: '110169484474386276334',
  email: 'ada@example.com',
  emailVerified: true,
};

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let operator: Awaited<ReturnType<typeof operatorAgent>>;

  beforeEach(async () => {
    app = await createApp();
    operator = await operatorAgent(app);
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => operator;

  async function createUser(provider = googleIdentity) {
    const res = await http()
      .post('/v1/users')
      .send({ displayName: 'Ada', email: 'ada@example.com', provider })
      .expect(201);
    return res.body as { id: string };
  }

  it('creates, reads, updates and lists users', async () => {
    const user = await createUser();

    const res = await http().get(`/v1/users/${user.id}`).expect(200);
    expect(res.body).toEqual({
      id: user.id,
      displayName: 'Ada',
      email: 'ada@example.com',
      status: 'active',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      lastSignInAt: null,
    });

    const updated = await http()
      .put(`/v1/users/${user.id}`)
      .send({ displayName: 'Ada Lovelace', email: null })
      .expect(200);
    expect(updated.body).toMatchObject({
      displayName: 'Ada Lovelace',
      email: null,
    });
    await http()
      .put(`/v1/users/${user.id}`)
      .send({ displayName: 'X' })
      .expect(400);

    const list = await http().get('/v1/users').expect(200);
    expect(list.body).toEqual({ items: [updated.body], nextCursor: null });

    await http().get(`/v1/users/${MISSING_ID}`).expect(404);
    await http().get('/v1/users/not-a-uuid').expect(400);
  });

  it('lets platform services read a user, and nothing else', async () => {
    const user = await createUser();
    const reader = await readerAgent(app);

    const res = await reader.get(`/v1/users/${user.id}`).expect(200);
    expect(res.body).toMatchObject({ id: user.id, email: 'ada@example.com' });
    await reader.get('/v1/users').expect(403);
    await reader
      .put(`/v1/users/${user.id}`)
      .send({ displayName: 'X', email: null })
      .expect(403);
    await reader.post(`/v1/users/${user.id}/disable`).expect(403);
  });

  it('disables and enables users idempotently', async () => {
    const user = await createUser();

    await http().post(`/v1/users/${user.id}/disable`).expect(200);
    const again = await http().post(`/v1/users/${user.id}/disable`).expect(200);
    expect(again.body.status).toBe('disabled');
    const enabled = await http()
      .post(`/v1/users/${user.id}/enable`)
      .expect(200);
    expect(enabled.body.status).toBe('active');
  });

  /** The user events in the outbox, oldest first: type, version, payload. */
  const userEvents = async () =>
    (
      await app.get(DataSource).query<
        {
          message: {
            eventType: string;
            aggregateVersion: number;
            payload: unknown;
          };
        }[]
      >('SELECT message FROM outbox ORDER BY created_at, id')
    ).map(({ message }) => [
      message.eventType,
      message.aggregateVersion,
      message.payload,
    ]);

  it('publishes every change with the user as they are, at a new version', async () => {
    const user = await createUser();
    const snapshot = (fields: Record<string, unknown> = {}) => ({
      userId: user.id,
      displayName: 'Ada',
      email: 'ada@example.com',
      status: 'active',
      ...fields,
    });

    await http()
      .put(`/v1/users/${user.id}`)
      .send({ displayName: 'Ada L.', email: 'ada@example.org' })
      .expect(200);
    // The same again: no new version, no event.
    await http()
      .put(`/v1/users/${user.id}`)
      .send({ displayName: 'Ada L.', email: 'ada@example.org' })
      .expect(200);
    await http().post(`/v1/users/${user.id}/disable`).expect(200);
    await http().post(`/v1/users/${user.id}/disable`).expect(200);
    await http().post(`/v1/users/${user.id}/enable`).expect(200);

    const changed = { displayName: 'Ada L.', email: 'ada@example.org' };
    expect(await userEvents()).toEqual([
      ['user.created', 1, snapshot()],
      ['user.updated', 2, snapshot(changed)],
      ['user.disabled', 3, snapshot({ ...changed, status: 'disabled' })],
      ['user.enabled', 4, snapshot(changed)],
    ]);
  });

  it('announces every user again at their current version (the backfill)', async () => {
    const ada = await createUser();
    const grace = await createUser({
      ...googleIdentity,
      subject: 'grace',
      email: 'grace@example.com',
    });
    await http().post(`/v1/users/${grace.id}/disable`).expect(200);

    const res = await http().post('/v1/users/announce').expect(200);
    expect(res.body).toEqual({ announced: 2 });
    const announced = (await userEvents()).slice(-2);
    expect(announced.map(([type]) => type)).toEqual([
      'user.updated',
      'user.updated',
    ]);
    expect(
      Object.fromEntries(
        announced.map(([, version, payload]) => [
          (payload as { userId: string }).userId,
          version,
        ]),
      ),
    ).toEqual({ [ada.id]: 1, [grace.id]: 2 });

    // Platform readers can't.
    await (await readerAgent(app)).post('/v1/users/announce').expect(403);
  });

  it('links and unlinks identities', async () => {
    const user = await createUser();
    const base = `/v1/users/${user.id}/providers`;

    const github = await http()
      .post(base)
      .send({
        provider: 'github',
        subject: '583231',
        email: null,
        emailVerified: false,
      })
      .expect(201);
    expect(github.body).toMatchObject({
      userId: user.id,
      provider: 'github',
      subject: '583231',
    });

    const list = await http().get(base).expect(200);
    expect(
      list.body.items.map((p: { provider: string }) => p.provider),
    ).toEqual(['google', 'github']);

    // Another user can't take an identity that's linked already.
    const bob = await createUser({ ...googleIdentity, subject: 'bob' });
    const taken = await http()
      .post(`/v1/users/${bob.id}/providers`)
      .send({
        provider: 'github',
        subject: '583231',
        email: null,
        emailVerified: false,
      })
      .expect(409);
    expect(taken.body.code).toBe('IDENTITY_ALREADY_LINKED');

    await http().delete(`${base}/${github.body.id}`).expect(204);
    await http().delete(`${base}/${github.body.id}`).expect(404);
    const last = await http()
      .delete(`${base}/${list.body.items[0].id}`)
      .expect(409);
    expect(last.body.code).toBe('USER_LAST_PROVIDER');
  });

  it('validates providers and identities', async () => {
    for (const provider of [
      { ...googleIdentity, provider: 'Google' },
      { ...googleIdentity, provider: 'has space' },
      { ...googleIdentity, subject: '' },
      { ...googleIdentity, email: 'not-an-email' },
      { ...googleIdentity, extra: true },
    ]) {
      await http()
        .post('/v1/users')
        .send({ displayName: 'Ada', email: null, provider })
        .expect(400);
    }

    await createUser();
    const duplicate = await http()
      .post('/v1/users')
      .send({ displayName: 'Ada 2', email: null, provider: googleIdentity })
      .expect(409);
    expect(duplicate.body.code).toBe('IDENTITY_ALREADY_LINKED');
    // ... and the user was rolled back with the failed link.
    const list = await http().get('/v1/users').expect(200);
    expect(list.body.items).toHaveLength(1);
  });

  it('is for platform operators only', async () => {
    const server = app.getHttpServer();
    await request(server).get('/v1/users').expect(401);

    const signer = app.get(TokenSigner);
    const reader = await signer.sign(
      { sub: 'hephaestus', sub_type: 'service', scope: 'platform:read' },
      600,
    );
    await request(server)
      .get('/v1/users')
      .set('authorization', `Bearer ${reader}`)
      .expect(403);

    const user = await signer.sign(
      { sub: '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', sub_type: 'user' },
      600,
    );
    await request(server)
      .get('/v1/users')
      .set('authorization', `Bearer ${user}`)
      .expect(403);
  });
});
