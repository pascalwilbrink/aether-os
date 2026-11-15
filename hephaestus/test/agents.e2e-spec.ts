import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { AppModule } from '../src/app.module.js';

const versionBody = {
  instructions: 'Be helpful.',
  model: { provider: 'anthropic', model: 'claude-opus-5-5', temperature: 0.2 },
  capabilities: ['chat'],
  tools: [{ name: 'search', enabled: true, configuration: { depth: 2 } }],
  skills: [{ name: 'summarize', version: '1.0.0', enabled: true }],
  runtime: {
    provider: 'local',
    executionMode: 'standard',
    sandboxRequired: false,
  },
  createdBy: 'user-1',
};

describe('Agents (e2e)', () => {
  let app: INestApplication<App>;
  let orgId: string;
  let base: string;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    orgId = await createOrganization('org-one');
    base = `/organizations/${orgId}/agents`;
  });

  afterEach(async () => {
    await app.close();
  });

  async function createOrganization(slug: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/organizations')
      .send({ name: slug, slug, createdBy: 'user-1' })
      .expect(201);

    return res.body.id;
  }

  async function createAgent(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(base)
      .send({
        name: 'Helper',
        description: 'A helpful agent',
        createdBy: 'user-1',
      })
      .expect(201);

    return res.body.id;
  }

  it('creates and fetches an agent', async () => {
    const id = await createAgent();

    const res = await request(app.getHttpServer())
      .get(`${base}/${id}`)
      .expect(200);

    expect(res.body).toMatchObject({
      id,
      organizationId: orgId,
      name: 'Helper',
      status: 'active',
      latestVersionId: null,
    });
    expect(res.body).not.toHaveProperty('props');
  });

  it('returns 404 for an agent in another organization', async () => {
    const id = await createAgent();
    const otherOrgId = await createOrganization('org-two');

    await request(app.getHttpServer())
      .get(`/organizations/${otherOrgId}/agents/${id}`)
      .expect(404);
  });

  it('rejects invalid bodies with 400', async () => {
    await request(app.getHttpServer())
      .post(base)
      .send({ name: '', createdBy: 'user-1', extra: true })
      .expect(400);

    const id = await createAgent();

    await request(app.getHttpServer())
      .post(`${base}/${id}/versions`)
      .send({
        ...versionBody,
        runtime: { ...versionBody.runtime, executionMode: 'turbo' },
      })
      .expect(400);
  });

  it('creates and publishes a version', async () => {
    const id = await createAgent();

    const created = await request(app.getHttpServer())
      .post(`${base}/${id}/versions`)
      .send(versionBody)
      .expect(201);

    expect(created.body).toMatchObject({
      version: 1,
      status: 'draft',
      publishedAt: null,
    });
    expect(created.body.tools).toEqual(versionBody.tools);

    const published = await request(app.getHttpServer())
      .post(`${base}/${id}/versions/${created.body.id}/publish`)
      .expect(200);

    expect(published.body.status).toBe('published');
    expect(typeof published.body.publishedAt).toBe('string');

    const agent = await request(app.getHttpServer())
      .get(`${base}/${id}`)
      .expect(200);
    expect(agent.body.latestVersionId).toBe(created.body.id);
  });

  it('lists agents with pagination', async () => {
    await createAgent();
    await createAgent();
    await createAgent();

    const res = await request(app.getHttpServer())
      .get(`${base}?limit=2&offset=1`)
      .expect(200);

    expect(res.body).toMatchObject({ total: 3, limit: 2, offset: 1 });
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toHaveProperty('name', 'Helper');

    const defaults = await request(app.getHttpServer()).get(base).expect(200);
    expect(defaults.body).toMatchObject({ total: 3, limit: 50, offset: 0 });

    await request(app.getHttpServer()).get(`${base}?limit=0`).expect(400);
    await request(app.getHttpServer()).get(`${base}?limit=101`).expect(400);
    await request(app.getHttpServer()).get(`${base}?offset=-1`).expect(400);
  });

  it('lists and fetches versions', async () => {
    const id = await createAgent();

    const v1 = await request(app.getHttpServer())
      .post(`${base}/${id}/versions`)
      .send(versionBody)
      .expect(201);
    await request(app.getHttpServer())
      .post(`${base}/${id}/versions`)
      .send(versionBody)
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`${base}/${id}/versions`)
      .expect(200);

    expect(list.body.total).toBe(2);
    expect(list.body.items.map((v: { version: number }) => v.version)).toEqual([
      2, 1,
    ]);

    const fetched = await request(app.getHttpServer())
      .get(`${base}/${id}/versions/${v1.body.id}`)
      .expect(200);
    expect(fetched.body).toMatchObject({ id: v1.body.id, version: 1 });

    const otherAgent = await createAgent();
    await request(app.getHttpServer())
      .get(`${base}/${otherAgent}/versions/${v1.body.id}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${base}/unknown/versions`)
      .expect(404);
  });

  it('publishing a version deprecates the previous one', async () => {
    const id = await createAgent();
    const server = app.getHttpServer();

    const v1 = await request(server)
      .post(`${base}/${id}/versions`)
      .send(versionBody)
      .expect(201);
    const v2 = await request(server)
      .post(`${base}/${id}/versions`)
      .send(versionBody)
      .expect(201);

    await request(server)
      .post(`${base}/${id}/versions/${v1.body.id}/publish`)
      .expect(200);
    await request(server)
      .post(`${base}/${id}/versions/${v2.body.id}/publish`)
      .expect(200);

    const list = await request(server)
      .get(`${base}/${id}/versions`)
      .expect(200);
    expect(
      list.body.items.map((v: { version: number; status: string }) => [
        v.version,
        v.status,
      ]),
    ).toEqual([
      [2, 'published'],
      [1, 'deprecated'],
    ]);
  });

  it('404s for an unknown organization', async () => {
    await request(app.getHttpServer())
      .post('/organizations/unknown/agents')
      .send({ name: 'Helper', description: '', createdBy: 'user-1' })
      .expect(404);
    await request(app.getHttpServer())
      .get('/organizations/unknown/agents')
      .expect(404);
  });

  it('blocks writes for a suspended organization', async () => {
    const server = app.getHttpServer();
    const id = await createAgent();
    const version = await request(server)
      .post(`${base}/${id}/versions`)
      .send(versionBody)
      .expect(201);

    await request(server).post(`/organizations/${orgId}/suspend`).expect(200);

    for (const call of [
      request(server)
        .post(base)
        .send({ name: 'X', description: '', createdBy: 'user-1' }),
      request(server).post(`${base}/${id}/versions`).send(versionBody),
      request(server).post(`${base}/${id}/versions/${version.body.id}/publish`),
      request(server).post(`${base}/${id}/archive`),
    ]) {
      const res = await call.expect(409);
      expect(res.body.error).toBe('ORGANIZATION_SUSPENDED');
    }

    // Reads still work.
    await request(server).get(`${base}/${id}`).expect(200);
    await request(server).get(`${base}/${id}/versions`).expect(200);

    await request(server).post(`/organizations/${orgId}/activate`).expect(200);
    await request(server)
      .post(`${base}/${id}/versions/${version.body.id}/publish`)
      .expect(200);
  });

  it('maps business-rule violations to 409', async () => {
    const id = await createAgent();

    const created = await request(app.getHttpServer())
      .post(`${base}/${id}/versions`)
      .send(versionBody)
      .expect(201);

    await request(app.getHttpServer())
      .post(`${base}/${id}/versions/${created.body.id}/publish`)
      .expect(200);

    const republish = await request(app.getHttpServer())
      .post(`${base}/${id}/versions/${created.body.id}/publish`)
      .expect(409);
    expect(republish.body.error).toBe('AGENT_VERSION_INVALID_TRANSITION');

    await request(app.getHttpServer())
      .post(`${base}/${id}/archive`)
      .expect(204);

    const afterArchive = await request(app.getHttpServer())
      .post(`${base}/${id}/versions`)
      .send(versionBody)
      .expect(409);
    expect(afterArchive.body.error).toBe('AGENT_ARCHIVED');
  });
});
