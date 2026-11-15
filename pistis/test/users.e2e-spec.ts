import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { createApp, MISSING_ID } from './app.js';

const googleIdentity = {
  provider: 'google',
  subject: '110169484474386276334',
  email: 'ada@example.com',
  emailVerified: true,
};

describe('Users (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

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
});
