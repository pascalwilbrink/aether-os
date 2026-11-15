import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { createApp, MISSING_ID } from './app.js';
import { asMember, type Client } from './auth.js';
import { organizationEvent, type FakePolis } from './fake-polis.js';

const versionBody = {
  instructions: 'Be helpful.',
  model: { provider: 'anthropic', model: 'claude', temperature: 0.2 },
  capabilities: ['chat'],
  tools: [{ name: 'search', enabled: true, configuration: { depth: 2 } }],
  skills: [{ name: 'summarize', version: '1.0.0', enabled: true }],
  runtime: {
    provider: 'local',
    executionMode: 'standard',
    sandboxRequired: false,
  },
};

describe('Agents (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let orgId: string;
  let base: string;
  let owner: Client;

  beforeEach(async () => {
    ({ app, polis } = await createApp());
    orgId = polis.organization();
    base = `/v1/organizations/${orgId}/agents`;
    owner = await asMember(app, orgId, ['owner']);
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => owner;

  async function createAgent(): Promise<string> {
    const res = await http()
      .post(base)
      .send({ name: 'Helper', description: 'Helps' })
      .expect(201);
    return res.body.id;
  }

  it('creates, fetches, lists and archives agents', async () => {
    const id = await createAgent();
    await createAgent();

    const agent = await http().get(`${base}/${id}`).expect(200);
    expect(agent.body).toEqual({
      id,
      organizationId: orgId,
      name: 'Helper',
      description: 'Helps',
      status: 'active',
      latestVersionId: null,
      createdBy: 'user-1',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const first = await http().get(`${base}?limit=1`).expect(200);
    const rest = await http()
      .get(base)
      .query({ limit: 1, cursor: first.body.nextCursor })
      .expect(200);
    expect(rest.body.nextCursor).toBeNull();

    const archived = await http().post(`${base}/${id}/archive`).expect(200);
    expect(archived.body.status).toBe('archived');
    await http().post(`${base}/${id}/archive`).expect(200);

    await http().get(`${base}/${MISSING_ID}`).expect(404);
    await http().get(`${base}/not-a-uuid`).expect(400);
  });

  it('validates agent and version bodies', async () => {
    await http().post(base).send({ name: '', description: '' }).expect(400);
    const id = await createAgent();

    const res = await http()
      .post(`${base}/${id}/versions`)
      .send({ ...versionBody, model: { provider: 'anthropic' }, extra: true })
      .expect(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pointer: '/model/model', code: 'REQUIRED' }),
      ]),
    );

    const unknown = await http()
      .post(`${base}/${id}/versions`)
      .send({ ...versionBody, extra: true })
      .expect(400);
    expect(unknown.body.errors).toEqual([
      expect.objectContaining({ pointer: '/extra', code: 'UNKNOWN_FIELD' }),
    ]);
  });

  it('creates and publishes versions', async () => {
    const id = await createAgent();
    const versions = `${base}/${id}/versions`;

    const v1 = await http().post(versions).send(versionBody).expect(201);
    const v2 = await http().post(versions).send(versionBody).expect(201);
    expect([v1.body.version, v2.body.version]).toEqual([1, 2]);
    expect(v1.body.tools).toEqual(versionBody.tools);

    await http().post(`${versions}/${v1.body.id}/publish`).expect(200);
    await http().post(`${versions}/${v1.body.id}/publish`).expect(200);
    await http().post(`${versions}/${v2.body.id}/publish`).expect(200);

    const list = await http().get(versions).expect(200);
    expect(list.body.items.map((v: { status: string }) => v.status)).toEqual([
      'published',
      'deprecated',
    ]);
    const agent = await http().get(`${base}/${id}`).expect(200);
    expect(agent.body.latestVersionId).toBe(v2.body.id);

    const republish = await http()
      .post(`${versions}/${v1.body.id}/publish`)
      .expect(409);
    expect(republish.body.code).toBe('AGENT_VERSION_INVALID_TRANSITION');

    await http().post(`${base}/${id}/archive`).expect(200);
    const archived = await http().post(versions).send(versionBody).expect(409);
    expect(archived.body.code).toBe('AGENT_ARCHIVED');
  });

  it('blocks writes for a suspended organization', async () => {
    const id = await createAgent();
    await organizationEvent(app, orgId, 'organization.suspended', 2);

    const res = await http()
      .post(base)
      .send({ name: 'X', description: '' })
      .expect(409);
    expect(res.body.code).toBe('ORGANIZATION_SUSPENDED');
    await http().post(`${base}/${id}/versions`).send(versionBody).expect(409);
    await http().get(`${base}/${id}`).expect(200);
    await http().get(`/v1/organizations/${MISSING_ID}/agents`).expect(404);
  });

  it('needs a token, and the right role for each step', async () => {
    await request(app.getHttpServer()).get(base).expect(401);
    const id = await createAgent();
    const versions = `${base}/${id}/versions`;

    const viewer = await asMember(app, orgId, ['viewer']);
    await viewer.get(`${base}/${id}`).expect(200);
    await viewer.post(base).send({ name: 'X', description: '' }).expect(403);

    // Members build agents, admins publish them.
    const member = await asMember(app, orgId, ['member'], {}, 'user-2');
    const draft = await member.post(versions).send(versionBody).expect(201);
    expect(draft.body.createdBy).toBe('user-2');
    await member.post(`${versions}/${draft.body.id}/publish`).expect(403);
    await (
      await asMember(app, orgId, ['admin'])
    )
      .post(`${versions}/${draft.body.id}/publish`)
      .expect(200);

    // Another organization's agents don't exist for this token.
    const other = polis.organization();
    await (
      await asMember(app, other, ['owner'])
    )
      .get(`${base}/${id}`)
      .expect(404);
  });
});
