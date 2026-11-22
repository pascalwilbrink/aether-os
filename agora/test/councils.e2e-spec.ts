import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';

import { asMember, createApp, type Client } from './app.js';
import type { FakePolis } from './fake-polis.js';
import { outboxEvents } from './outbox.js';

const MISSING_ID = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

const agentVersion = {
  instructions: 'Be helpful.',
  model: { provider: 'anthropic', model: 'claude' },
  capabilities: [],
  tools: [],
  skills: [],
  runtime: {
    provider: 'local',
    executionMode: 'standard',
    sandboxRequired: false,
  },
};

describe('Councils (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let orgId: string;
  let owner: Client;
  let councils: string;

  beforeEach(async () => {
    ({ app, polis } = await createApp());
    orgId = polis.organization();
    owner = await asMember(app, orgId, ['owner']);
    councils = `/v1/organizations/${orgId}/councils`;
  });

  afterEach(async () => {
    await app.close();
  });

  /** An agent, published unless told otherwise. */
  async function agent(name: string, publish = true): Promise<string> {
    const agents = `/v1/organizations/${orgId}/agents`;
    const { body } = await owner
      .post(agents)
      .send({ name, description: '' })
      .expect(201);
    const version = await owner
      .post(`${agents}/${body.id}/versions`)
      .send(agentVersion)
      .expect(201);
    if (publish) {
      await owner
        .post(`${agents}/${body.id}/versions/${version.body.id}/publish`)
        .expect(200);
    }
    return body.id as string;
  }

  async function council(key = 'software-architecture'): Promise<string> {
    const { body } = await owner
      .post(councils)
      .send({ key, name: 'Software Architecture', description: 'Design.' })
      .expect(201);
    return body.id as string;
  }

  it('creates, lists and archives councils, with unique keys', async () => {
    const id = await council();
    const { body } = await owner.get(`${councils}/${id}`).expect(200);
    expect(body).toEqual({
      id,
      organizationId: orgId,
      key: 'software-architecture',
      name: 'Software Architecture',
      description: 'Design.',
      status: 'active',
      latestVersionId: null,
      createdBy: 'user-1',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const taken = await owner
      .post(councils)
      .send({ key: 'software-architecture', name: 'Again', description: '' })
      .expect(409);
    expect(taken.body.code).toBe('COUNCIL_ALREADY_EXISTS');
    await owner
      .post(councils)
      .send({ key: 'Not A Key', name: 'x', description: '' })
      .expect(400);
    // Another organization may use the same key.
    const other = polis.organization();
    await (
      await asMember(app, other, ['owner'])
    )
      .post(`/v1/organizations/${other}/councils`)
      .send({ key: 'software-architecture', name: 'x', description: '' })
      .expect(201);

    await council('security');
    const page = await owner.get(councils).query({ limit: 1 }).expect(200);
    expect(page.body.items.map((c: { key: string }) => c.key)).toEqual([
      'security',
    ]);

    await owner.post(`${councils}/${id}/archive`).expect(200);
    const archived = await owner.post(`${councils}/${id}/archive`).expect(200);
    expect(archived.body.status).toBe('archived');
    const refused = await owner
      .post(`${councils}/${id}/versions`)
      .send({ facilitator: { agentId: MISSING_ID }, members: [] })
      .expect(400);
    expect(refused.body.errors).toBeDefined();
    await owner.get(`${councils}/${MISSING_ID}`).expect(404);

    const events = await outboxEvents(app);
    expect(
      events
        .filter((e) => e.aggregateId === id)
        .map((e) => [e.eventType, e.aggregateVersion]),
    ).toEqual([
      ['council.created', 1],
      ['council.archived', 2],
    ]);
  });

  it('versions councils of published agents, publishing one at a time', async () => {
    const [facilitator, architect, security, reviewer] = await Promise.all([
      agent('Facilitator'),
      agent('Architect'),
      agent('Security'),
      agent('Reviewer'),
    ]);
    const id = await council();
    const versions = `${councils}/${id}/versions`;
    const body = {
      facilitator: { agentId: facilitator },
      members: [
        { agentId: architect, participation: 'required' },
        {
          agentId: security,
          participation: 'conditional',
          when: 'Authentication or data handling.',
        },
        {
          agentId: reviewer,
          participation: 'optional',
          role: 'Challenges assumptions.',
        },
      ],
      settings: { allowDelegation: true },
      discussion: { maxRounds: 2 },
    };

    const first = await owner.post(versions).send(body).expect(201);
    expect(first.body).toEqual({
      id: expect.any(String),
      councilId: id,
      organizationId: orgId,
      version: 1,
      status: 'draft',
      facilitator: { agentId: facilitator },
      members: body.members,
      settings: {
        defaultMode: 'facilitated',
        allowDirectInteraction: true,
        allowDiscussion: true,
        allowPlanning: true,
        allowDelegation: true,
        requireSynthesis: true,
      },
      discussion: {
        maxRounds: 2,
        allowAgentResponses: true,
        requireFacilitatorConclusion: true,
      },
      createdBy: 'user-1',
      createdAt: expect.any(String),
      publishedAt: null,
    });

    // Members publish; a member can't publish.
    const member = await asMember(app, orgId, ['member']);
    await member.post(`${versions}/${first.body.id}/publish`).expect(403);
    const published = await owner
      .post(`${versions}/${first.body.id}/publish`)
      .expect(200);
    expect(published.body.status).toBe('published');
    await owner.post(`${versions}/${first.body.id}/publish`).expect(200);

    const second = await member
      .post(versions)
      .send({ ...body, members: body.members.slice(0, 1) })
      .expect(201);
    expect(second.body.version).toBe(2);
    await owner.post(`${versions}/${second.body.id}/publish`).expect(200);

    const list = await member.get(versions).expect(200);
    expect(
      list.body.items.map((v: { version: number; status: string }) => [
        v.version,
        v.status,
      ]),
    ).toEqual([
      [2, 'published'],
      [1, 'deprecated'],
    ]);
    const again = await owner
      .post(`${versions}/${first.body.id}/publish`)
      .expect(409);
    expect(again.body.code).toBe('COUNCIL_VERSION_INVALID_TRANSITION');
    expect((await owner.get(`${councils}/${id}`)).body.latestVersionId).toBe(
      second.body.id,
    );
    // Viewers read; they don't write.
    const viewer = await asMember(app, orgId, ['viewer']);
    await viewer.get(`${versions}/${second.body.id}`).expect(200);
    await viewer.post(versions).send(body).expect(403);

    const events = (await outboxEvents(app)).filter(
      (e) => e.aggregateId === id,
    );
    expect(events.map((e) => [e.eventType, e.aggregateVersion])).toEqual([
      ['council.created', 1],
      ['council-version.published', 2],
      ['council-version.published', 3],
      ['council-version.deprecated', 4],
    ]);
    expect(events[2].payload).toMatchObject({
      councilId: id,
      councilVersionId: second.body.id,
      previousVersionId: first.body.id,
      version: { id: second.body.id, status: 'published', version: 2 },
    });
  });

  it('refuses versions whose agents or settings do not fit', async () => {
    const facilitator = await agent('Facilitator');
    const architect = await agent('Architect');
    const draft = await agent('Draft only', false);
    const id = await council();
    const versions = `${councils}/${id}/versions`;
    const refuse = async (body: object, reason: string) => {
      const res = await owner.post(versions).send(body).expect(409);
      expect(res.body).toMatchObject({ code: 'COUNCIL_VERSION_INVALID' });
      expect(res.body.detail).toContain(reason);
    };
    const members = [{ agentId: architect, participation: 'required' }];

    await refuse(
      { facilitator: { agentId: MISSING_ID }, members },
      'has no agent',
    );
    await refuse(
      {
        facilitator: { agentId: facilitator },
        members: [{ agentId: draft, participation: 'required' }],
      },
      'no published version',
    );
    await refuse(
      {
        facilitator: { agentId: facilitator },
        members: [{ agentId: facilitator, participation: 'required' }],
      },
      'is the facilitator',
    );
    await refuse(
      {
        facilitator: { agentId: facilitator },
        members: [{ agentId: architect, participation: 'conditional' }],
      },
      'say when',
    );
    await refuse(
      {
        facilitator: { agentId: facilitator },
        members,
        settings: { defaultMode: 'discussion', allowDiscussion: false },
      },
      "isn't one the settings allow",
    );
    await owner
      .post(versions)
      .send({
        facilitator: { agentId: facilitator },
        members,
        discussion: { maxRounds: 11 },
      })
      .expect(400);

    // An agent archived after the draft: refused when publishing.
    const ok = await owner
      .post(versions)
      .send({ facilitator: { agentId: facilitator }, members })
      .expect(201);
    await owner
      .post(`/v1/organizations/${orgId}/agents/${architect}/archive`)
      .expect(200);
    const publish = await owner
      .post(`${versions}/${ok.body.id}/publish`)
      .expect(409);
    expect(publish.body.detail).toContain('is archived');
    expect(ok.body.version).toBe(1);
  });
});
