import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { createApp, MISSING_ID } from './app.js';

describe('Memberships (e2e)', () => {
  let app: INestApplication<App>;
  let orgId: string;
  let base: string;

  beforeEach(async () => {
    app = await createApp();
    const org = await http()
      .post('/v1/organizations')
      .send({ name: 'Acme', slug: 'acme', createdBy: 'user-0' })
      .expect(201);
    orgId = org.body.id;
    base = `/v1/organizations/${orgId}/memberships`;
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const add = (body: Record<string, unknown> = {}) =>
    http()
      .post(base)
      .send({
        subjectType: 'user',
        subject: 'user-1',
        roles: ['member'],
        createdBy: 'user-0',
        ...body,
      });

  it('creates, reads, replaces and deletes a membership', async () => {
    const created = await add({ roles: ['viewer', 'admin', 'viewer'] }).expect(
      201,
    );
    expect(created.body).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7/),
      organizationId: orgId,
      subjectType: 'user',
      subject: 'user-1',
      roles: ['admin', 'viewer'],
      createdBy: 'user-0',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const url = `${base}/${created.body.id}`;

    await http().get(url).expect(200);

    const updated = await http()
      .put(url)
      .send({ roles: ['owner'] })
      .expect(200);
    expect(updated.body.roles).toEqual(['owner']);

    const list = await http().get(base).expect(200);
    expect(list.body).toEqual({ items: [updated.body], nextCursor: null });

    await http().delete(url).expect(204);
    await http().get(url).expect(404);
    await http().delete(url).expect(404);
  });

  it('validates roles, subjects and PUT bodies', async () => {
    const empty = await add({ roles: [] }).expect(400);
    expect(empty.body.errors).toEqual([
      expect.objectContaining({ pointer: '/roles', code: 'INVALID' }),
    ]);

    const unknown = await add({ roles: ['superuser'] }).expect(400);
    expect(unknown.body.errors).toEqual([
      expect.objectContaining({ pointer: '/roles/0', code: 'INVALID' }),
    ]);

    await add({ subjectType: 'robot' }).expect(400);
    await add({ subject: '' }).expect(400);

    const created = await add().expect(201);
    const missingRoles = await http()
      .put(`${base}/${created.body.id}`)
      .send({})
      .expect(400);
    expect(missingRoles.body.errors).toEqual([
      expect.objectContaining({ pointer: '/roles', code: 'REQUIRED' }),
    ]);
    await http()
      .put(`${base}/${created.body.id}`)
      .send({ roles: ['owner'], subject: 'someone-else' })
      .expect(400);
  });

  it('rejects a second membership for the same principal', async () => {
    await add().expect(201);

    const duplicate = await add({ roles: ['owner'] }).expect(409);
    expect(duplicate.body.code).toBe('MEMBERSHIP_EXISTS');
  });

  it("lists a principal's memberships across organizations", async () => {
    const globex = await http()
      .post('/v1/organizations')
      .send({ name: 'Globex', slug: 'globex', createdBy: 'user-0' })
      .expect(201);
    await add().expect(201);
    await http()
      .post(`/v1/organizations/${globex.body.id}/memberships`)
      .send({
        subjectType: 'user',
        subject: 'user-1',
        roles: ['owner'],
        createdBy: 'user-0',
      })
      .expect(201);

    const res = await http()
      .get('/v1/memberships')
      .query({ subjectType: 'user', subject: 'user-1' })
      .expect(200);
    expect(
      res.body.items.map((m: { organizationId: string; roles: string[] }) => [
        m.organizationId,
        m.roles,
      ]),
    ).toEqual([
      [globex.body.id, ['owner']],
      [orgId, ['member']],
    ]);

    const missing = await http()
      .get('/v1/memberships')
      .query({ subject: 'user-1' })
      .expect(400);
    expect(missing.body.errors).toEqual([
      expect.objectContaining({ parameter: 'subjectType', code: 'REQUIRED' }),
    ]);
  });

  it('404s for unknown organizations and blocks writes while suspended', async () => {
    await http().get(`/v1/organizations/${MISSING_ID}/memberships`).expect(404);
    await http().get(`${base}/not-a-uuid`).expect(400);

    const created = await add().expect(201);
    await http().post(`/v1/organizations/${orgId}/suspend`).expect(200);

    const blocked = await add({ subject: 'user-2' }).expect(409);
    expect(blocked.body.code).toBe('ORGANIZATION_SUSPENDED');
    await http()
      .put(`${base}/${created.body.id}`)
      .send({ roles: ['owner'] })
      .expect(409);
    await http().delete(`${base}/${created.body.id}`).expect(409);
    await http().get(`${base}/${created.body.id}`).expect(200);
  });
});
