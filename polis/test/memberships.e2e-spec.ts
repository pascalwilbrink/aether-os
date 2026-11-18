import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';

import { createApp, MISSING_ID } from './app.js';
import {
  asMember,
  asOperator,
  asOwner,
  type Client,
  foundOrganization,
} from './auth.js';

describe('Memberships (e2e)', () => {
  let app: INestApplication<App>;
  let orgId: string;
  let base: string;
  let owner: Client;
  let operator: Client;

  beforeEach(async () => {
    app = await createApp();
    // Founded by user-0, its first owner.
    orgId = (await foundOrganization(app, 'acme', 'user-0')).id;
    owner = await asOwner(app, orgId, 'user-0');
    operator = await asOperator(app);
    base = `/v1/organizations/${orgId}/memberships`;
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => owner;

  const add = (body: Record<string, unknown> = {}) =>
    http()
      .post(base)
      .send({
        subjectType: 'user',
        subject: 'user-1',
        roles: ['member'],
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
    expect(list.body).toEqual({
      items: [
        updated.body,
        expect.objectContaining({ subject: 'user-0', roles: ['owner'] }),
      ],
      nextCursor: null,
    });

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

  it('lists only users or only service accounts, also for platform readers', async () => {
    await add().expect(201);
    await add({
      subjectType: 'service_account',
      subject: 'sa-1',
      roles: ['member'],
    }).expect(201);
    const subjects = (body: { items: { subject: string }[] }) =>
      body.items.map((m) => m.subject);

    const users = await owner
      .get(base)
      .query({ subjectType: 'user' })
      .expect(200);
    expect(subjects(users.body)).toEqual(['user-1', 'user-0']);
    const accounts = await owner
      .get(base)
      .query({ subjectType: 'service_account' })
      .expect(200);
    expect(subjects(accounts.body)).toEqual(['sa-1']);
    await owner.get(base).query({ subjectType: 'robot' }).expect(400);

    // Pistis reads them with its own token, for the organization's people.
    const asPistis = await operator.get(base).expect(200);
    expect(subjects(asPistis.body)).toEqual(['sa-1', 'user-1', 'user-0']);
  });

  it("lists a principal's memberships across organizations", async () => {
    const globex = { body: await foundOrganization(app, 'globex', 'user-0') };
    await add().expect(201);
    await (
      await asOwner(app, globex.body.id, 'user-0')
    )
      .post(`/v1/organizations/${globex.body.id}/memberships`)
      .send({
        subjectType: 'user',
        subject: 'user-1',
        roles: ['owner'],
      })
      .expect(201);

    const res = await operator
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
    // With each organization's name and slug, to choose one.
    expect(res.body.items[0].organization).toEqual({
      name: 'globex',
      slug: 'globex',
    });

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
    await operator.post(`/v1/organizations/${orgId}/suspend`).expect(200);

    const blocked = await add({ subject: 'user-2' }).expect(409);
    expect(blocked.body.code).toBe('ORGANIZATION_SUSPENDED');
    await http()
      .put(`${base}/${created.body.id}`)
      .send({ roles: ['owner'] })
      .expect(409);
    await http().delete(`${base}/${created.body.id}`).expect(409);
    await http().get(`${base}/${created.body.id}`).expect(200);
  });

  it('lets admins manage members, and only owners manage owners', async () => {
    const admin = await asMember(app, orgId, ['admin'], { sub: 'user-9' });
    const member = await add().expect(201);

    await admin.get(base).expect(200);
    await admin
      .put(`${base}/${member.body.id}`)
      .send({ roles: ['admin'] })
      .expect(200);
    await admin
      .put(`${base}/${member.body.id}`)
      .send({ roles: ['owner'] })
      .expect(403);
    await admin
      .post(base)
      .send({ subjectType: 'user', subject: 'user-3', roles: ['owner'] })
      .expect(403);

    const founder = (await admin.get(base).expect(200)).body.items.find(
      (m: { subject: string }) => m.subject === 'user-0',
    );
    await admin.delete(`${base}/${founder.id}`).expect(403);
    await admin
      .put(`${base}/${founder.id}`)
      .send({ roles: ['member'] })
      .expect(403);

    // Members and viewers read, but don't manage.
    const viewer = await asMember(app, orgId, ['viewer']);
    await viewer.get(base).expect(200);
    await viewer.delete(`${base}/${member.body.id}`).expect(403);
  });

  it('lets people list their own memberships, and only theirs', async () => {
    await add({ subject: 'user-1' }).expect(201);
    const user = await asMember(app, orgId, ['member'], { sub: 'user-1' });

    const own = await user
      .get('/v1/memberships')
      .query({ subjectType: 'user', subject: 'user-1' })
      .expect(200);
    expect(own.body.items).toEqual([
      expect.objectContaining({ organizationId: orgId, roles: ['member'] }),
    ]);
    await user
      .get('/v1/memberships')
      .query({ subjectType: 'user', subject: 'user-0' })
      .expect(403);
  });
});
