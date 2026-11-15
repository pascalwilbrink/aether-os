import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { createApp, MISSING_ID } from './app.js';
import {
  asMember,
  asOperator,
  asUser,
  client,
  type Client,
  foundOrganization,
} from './auth.js';
import { outboxEvents } from './outbox.js';
import { tokens } from './tokens.js';

describe('Organizations (e2e)', () => {
  let app: INestApplication<App>;
  let operator: Client;

  beforeEach(async () => {
    app = await createApp();
    operator = await asOperator(app);
  });

  afterEach(async () => {
    await app.close();
  });

  // A platform operator: lists, suspends and activates organizations.
  const http = () => operator;

  async function createOrganization(slug = 'acme') {
    const res = await http()
      .post('/v1/organizations')
      .send({ name: 'Acme', slug })
      .expect(201);

    return res.body as { id: string; slug: string };
  }

  it('creates and fetches an organization by ID and slug', async () => {
    const org = await createOrganization();
    expect(org.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);

    const byId = await http().get(`/v1/organizations/${org.id}`).expect(200);
    expect(byId.body).toEqual({
      id: org.id,
      name: 'Acme',
      slug: 'acme',
      status: 'active',
      createdBy: 'operator',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      version: 1,
    });

    const bySlug = await http()
      .get('/v1/organizations/by-slug/acme')
      .expect(200);
    expect(bySlug.body.id).toBe(org.id);

    const missing = await http()
      .get(`/v1/organizations/${MISSING_ID}`)
      .expect(404)
      .expect('Content-Type', /application\/problem\+json/);
    expect(missing.body.code).toBe('NOT_FOUND');
  });

  it('rejects IDs that are not UUIDs', async () => {
    const res = await http().get('/v1/organizations/unknown').expect(400);

    expect(res.body.errors).toEqual([
      expect.objectContaining({ parameter: 'organizationId', code: 'INVALID' }),
    ]);
  });

  it('validates the body and rejects duplicate slugs', async () => {
    for (const slug of ['Acme', 'a', '-acme', 'acme-', 'ac--me', 'acme corp']) {
      const res = await http()
        .post('/v1/organizations')
        .send({ name: 'Acme', slug })
        .expect(400);
      expect(res.body.errors).toEqual([
        expect.objectContaining({ pointer: '/slug', code: 'INVALID' }),
      ]);
    }

    const unknown = await http()
      .post('/v1/organizations')
      .send({ name: 'Acme', slug: 'acme', status: 'x' })
      .expect(400);
    expect(unknown.body.errors).toEqual([
      expect.objectContaining({ pointer: '/status', code: 'UNKNOWN_FIELD' }),
    ]);

    const missing = await http().post('/v1/organizations').send({}).expect(400);
    expect(
      missing.body.errors.map((e: { pointer: string }) => e.pointer),
    ).toEqual(['/name', '/slug']);

    await createOrganization('acme');
    const duplicate = await http()
      .post('/v1/organizations')
      .send({ name: 'Acme 2', slug: 'acme' })
      .expect(409);
    expect(duplicate.body).toMatchObject({
      type: 'urn:aether-os:problem:organization-slug-taken',
      code: 'ORGANIZATION_SLUG_TAKEN',
    });
  });

  it('suspends and activates idempotently', async () => {
    const org = await createOrganization();

    const suspended = await http()
      .post(`/v1/organizations/${org.id}/suspend`)
      .expect(200);
    expect(suspended.body).toMatchObject({ status: 'suspended', version: 2 });

    const again = await http()
      .post(`/v1/organizations/${org.id}/suspend`)
      .expect(200);
    expect(again.body).toEqual(suspended.body);

    const activated = await http()
      .post(`/v1/organizations/${org.id}/activate`)
      .expect(200);
    expect(activated.body.status).toBe('active');

    await http().post(`/v1/organizations/${MISSING_ID}/suspend`).expect(404);
  });

  it('lists organizations newest first with cursors', async () => {
    await createOrganization('acme');
    await createOrganization('globex');

    const first = await http().get('/v1/organizations?limit=1').expect(200);
    expect(first.body.items.map((o: { slug: string }) => o.slug)).toEqual([
      'globex',
    ]);
    expect(typeof first.body.nextCursor).toBe('string');

    const next = await http()
      .get('/v1/organizations')
      .query({ limit: 1, cursor: first.body.nextCursor })
      .expect(200);
    expect(next.body).toEqual({
      items: [expect.objectContaining({ slug: 'acme' })],
      nextCursor: null,
    });

    await http().get('/v1/organizations?limit=0').expect(400);
    await http().get('/v1/organizations?offset=1').expect(400);
    const bad = await http().get('/v1/organizations?cursor=nope').expect(400);
    expect(bad.body.code).toBe('INVALID_CURSOR');
  });

  it('makes the person who creates an organization its owner', async () => {
    const org = await foundOrganization(app, 'acme', 'user-7');

    const owner = await asMember(app, org.id, ['owner'], { sub: 'user-7' });
    const members = await owner
      .get(`/v1/organizations/${org.id}/memberships`)
      .expect(200);
    expect(members.body.items).toEqual([
      expect.objectContaining({
        subjectType: 'user',
        subject: 'user-7',
        roles: ['owner'],
        createdBy: 'user-7',
      }),
    ]);

    // Recorded as done by the founder, in the same transaction.
    const events = await outboxEvents(app);
    expect(events.map((event) => [event.eventType, event.actor?.sub])).toEqual([
      ['organization.created', 'user-7'],
      ['membership.granted', 'user-7'],
    ]);

    // Organizations created by platform operators have no owner yet.
    const operated = await http()
      .post('/v1/organizations')
      .send({ name: 'Globex', slug: 'globex' })
      .expect(201);
    expect(operated.body.createdBy).toBe('operator');
  });

  it('needs a token, and shows people only their own organization', async () => {
    const acme = await foundOrganization(app, 'acme');
    const globex = await foundOrganization(app, 'globex', 'user-2');

    const anonymous = await request(app.getHttpServer())
      .get(`/v1/organizations/${acme.id}`)
      .expect(401);
    expect(anonymous.body.code).toBe('UNAUTHENTICATED');

    const viewer = await asMember(app, acme.id, ['viewer']);
    await viewer.get(`/v1/organizations/${acme.id}`).expect(200);
    await viewer.get('/v1/organizations/by-slug/acme').expect(200);
    // Another organization is not found, not forbidden.
    await viewer.get(`/v1/organizations/${globex.id}`).expect(404);
    await viewer.get('/v1/organizations/by-slug/globex').expect(404);

    // Platform operations are for platform services.
    await viewer.get('/v1/organizations').expect(403);
    await (
      await asMember(app, acme.id, ['owner'])
    )
      .post(`/v1/organizations/${acme.id}/suspend`)
      .expect(403);
    const reader = client(app, await tokens.service('hephaestus'));
    await reader.get(`/v1/organizations/${acme.id}`).expect(200);
    await reader.post(`/v1/organizations/${acme.id}/suspend`).expect(403);
    await reader
      .post('/v1/organizations')
      .send({ name: 'X', slug: 'x-org' })
      .expect(403);

    // Service accounts don't found organizations.
    await client(app, await tokens.user({ subType: 'service_account' }))
      .post('/v1/organizations')
      .send({ name: 'X', slug: 'x-org' })
      .expect(403);
    await (await asUser(app)).get(`/v1/organizations/${acme.id}`).expect(404);
  });
});
