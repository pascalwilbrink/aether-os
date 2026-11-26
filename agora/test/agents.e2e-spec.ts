import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { asMember, createApp, type Client } from './app.js';
import type { FakeHephaestus } from './fake-hephaestus.js';
import type { FakePolis } from './fake-polis.js';
import { outboxEvents } from './outbox.js';
import { tokens } from './tokens.js';

const MISSING_ID = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

const versionBody = {
  instructions: 'Be helpful.',
  model: { provider: 'anthropic', model: 'claude', temperature: 0.2 },
  capabilities: ['chat'],
  tools: [{ name: 'search', enabled: false, tools: ['query'] }],
  skills: [{ name: 'summarize', version: '1', enabled: false }],
  runtime: {
    provider: 'local',
    executionMode: 'standard',
    sandboxRequired: false,
  },
};

describe('Agents (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let hephaestus: FakeHephaestus;
  let orgId: string;
  let base: string;
  let owner: Client;

  beforeEach(async () => {
    ({ app, polis, hephaestus } = await createApp());
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
    polis.organizations.set(orgId, {
      id: orgId,
      status: 'suspended',
      version: 2,
    });

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
    const member = await asMember(app, orgId, ['member'], { sub: 'user-2' });
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

  it('publishes every change as an event, the whole version included', async () => {
    const id = await createAgent();
    const versions = `${base}/${id}/versions`;
    const v1 = await http().post(versions).send(versionBody).expect(201);
    const v2 = await http().post(versions).send(versionBody).expect(201);
    await http().post(`${versions}/${v1.body.id}/publish`).expect(200);
    const published = await http()
      .post(`${versions}/${v2.body.id}/publish`)
      .expect(200);
    // Publishing the published version, and archiving twice, change nothing.
    await http().post(`${versions}/${v2.body.id}/publish`).expect(200);
    await http().post(`${base}/${id}/archive`).expect(200);
    await http().post(`${base}/${id}/archive`).expect(200);

    const events = await outboxEvents(app);
    expect(
      events.map((event) => [event.eventType, event.aggregateVersion]),
    ).toEqual([
      ['agent.created', 1],
      ['agent-version.published', 2],
      ['agent-version.published', 3],
      ['agent-version.deprecated', 4],
      ['agent.archived', 5],
    ]);
    expect(events.every((event) => event.aggregateId === id)).toBe(true);
    expect(events[0]).toMatchObject({
      organizationId: orgId,
      projectId: null,
      actor: { sub: 'user-1', sub_type: 'user' },
      payload: {
        agentId: id,
        name: 'Helper',
        description: 'Helps',
        createdBy: 'user-1',
      },
    });
    expect(events[2].payload).toEqual({
      agentId: id,
      agentVersionId: v2.body.id,
      policySetVersionId: null,
      previousVersionId: v1.body.id,
      version: published.body,
    });
    expect(events[1].payload).toMatchObject({ previousVersionId: null });
    expect(events[3].payload).toEqual({
      agentId: id,
      agentVersionId: v1.body.id,
    });
  });

  it("checks a version's skills itself, and asks Pylon and Hephaestus about its model and tools", async () => {
    const id = await createAgent();
    const versions = `${base}/${id}/versions`;

    await http().post(versions).send(versionBody).expect(201);
    expect(hephaestus.checked).toEqual([
      {
        organizationId: orgId,
        choices: expect.objectContaining({
          model: versionBody.model,
          tools: versionBody.tools,
        }),
      },
    ]);

    for (const [body, code] of [
      [
        { model: { provider: 'anthropic', model: 'gone' } },
        'MODEL_NOT_AVAILABLE',
      ],
      [{ tools: [{ name: 'search', enabled: true }] }, 'TOOL_SERVER_INVALID'],
      [
        { skills: [{ name: 'summarize', version: '1', enabled: true }] },
        'SKILL_INVALID',
      ],
      [
        {
          skills: [
            { name: 'summarize', version: '1', enabled: false },
            { name: 'summarize', version: '1', enabled: false },
          ],
        },
        'SKILL_INVALID',
      ],
    ] as const) {
      const res = await http()
        .post(versions)
        .send({ ...versionBody, ...body })
        .expect(409);
      expect(res.body.code).toBe(code);
    }

    hephaestus.toolServers.add('search');
    await http()
      .post(versions)
      .send({ ...versionBody, tools: [{ name: 'search', enabled: true }] })
      .expect(201);

    // A skill of the organization's, at a version it has; not once archived.
    const skillMd = '---\nname: summarize\ndescription: Summarizes\n---\n';
    const skill = await http()
      .post(`/v1/organizations/${orgId}/skills`)
      .send({
        name: 'summarize',
        files: [{ path: 'SKILL.md', content: skillMd }],
      })
      .expect(201);
    const pinning = (version: string) => ({
      ...versionBody,
      skills: [{ name: 'summarize', version, enabled: true }],
    });
    expect(
      (await http().post(versions).send(pinning('2')).expect(409)).body.code,
    ).toBe('SKILL_INVALID');
    await http().post(versions).send(pinning('1')).expect(201);
    await http()
      .post(`/v1/organizations/${orgId}/skills/${skill.body.id}/archive`)
      .expect(200);
    expect(
      (await http().post(versions).send(pinning('1')).expect(409)).body.code,
    ).toBe('SKILL_INVALID');

    // Without Hephaestus no version is created, rather than an unchecked one.
    hephaestus.down = true;
    await http().post(versions).send(versionBody).expect(503);
    const list = await http().get(versions).expect(200);
    expect(list.body.items).toHaveLength(3);
  });

  it('announces every agent again, replaying its events (the backfill)', async () => {
    const active = await createAgent();
    const archived = await createAgent();
    await http().post(`${base}/${archived}/archive`).expect(200);
    const before = (await outboxEvents(app)).length;

    const operator = request
      .agent(app.getHttpServer())
      .set(
        'authorization',
        `Bearer ${await tokens.service('operator', ['platform:read', 'platform:manage'])}`,
      );
    const res = await operator.post('/v1/agents/announce').expect(200);
    expect(res.body).toEqual({ announced: 2 });
    const announced = (await outboxEvents(app))
      .slice(before)
      .map((e) => [e.eventType, e.aggregateId, e.aggregateVersion]);
    expect(announced).toEqual(
      expect.arrayContaining([
        ['agent.created', active, 1],
        ['agent.created', archived, 1],
        ['agent.archived', archived, 2],
      ]),
    );
    expect(announced).toHaveLength(3);

    await http().post('/v1/agents/announce').expect(403);
  });
});
