import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { createApp, MISSING_ID } from './app.js';

describe('Projects (e2e)', () => {
  let app: INestApplication<App>;
  let orgId: string;
  let base: string;

  beforeEach(async () => {
    app = await createApp();

    const org = await http()
      .post('/v1/organizations')
      .send({ name: 'Acme', slug: 'acme', createdBy: 'user-1' })
      .expect(201);
    orgId = org.body.id;
    base = `/v1/organizations/${orgId}/projects`;
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function createProject(slug = 'app'): Promise<string> {
    const res = await http()
      .post(base)
      .send({
        name: 'App',
        slug,
        description: 'The main app',
        createdBy: 'user-1',
      })
      .expect(201);

    return res.body.id;
  }

  it('creates, fetches and lists projects', async () => {
    const id = await createProject();

    const res = await http().get(`${base}/${id}`).expect(200);
    expect(res.body).toEqual({
      id,
      organizationId: orgId,
      name: 'App',
      slug: 'app',
      description: 'The main app',
      status: 'active',
      createdBy: 'user-1',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    await createProject('other');
    const list = await http().get(`${base}?limit=1`).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(typeof list.body.nextCursor).toBe('string');

    // A cursor belongs to its organization's list.
    const other = await http()
      .post('/v1/organizations')
      .send({ name: 'Globex', slug: 'globex', createdBy: 'user-1' })
      .expect(201);
    const foreign = await http()
      .get(`/v1/organizations/${other.body.id}/projects`)
      .query({ cursor: list.body.nextCursor })
      .expect(400);
    expect(foreign.body.code).toBe('INVALID_CURSOR');

    await http().get(`${base}/${MISSING_ID}`).expect(404);
    await http().get(`${base}/unknown`).expect(400);
    await http().get(`/v1/organizations/${MISSING_ID}/projects`).expect(404);
  });

  it('validates input and rejects duplicate slugs', async () => {
    await http()
      .post(base)
      .send({
        name: 'App',
        slug: 'Bad Slug',
        description: '',
        createdBy: 'user-1',
      })
      .expect(400);

    await createProject('app');

    const duplicate = await http()
      .post(base)
      .send({
        name: 'App 2',
        slug: 'app',
        description: '',
        createdBy: 'user-1',
      })
      .expect(409);
    expect(duplicate.body.code).toBe('PROJECT_SLUG_TAKEN');
  });

  it('archives a project idempotently', async () => {
    const id = await createProject();

    const archived = await http().post(`${base}/${id}/archive`).expect(200);
    expect(archived.body).toMatchObject({ id, status: 'archived' });

    const again = await http().post(`${base}/${id}/archive`).expect(200);
    expect(again.body).toEqual(archived.body);
  });

  it('blocks writes for a suspended organization', async () => {
    const id = await createProject();

    await http().post(`/v1/organizations/${orgId}/suspend`).expect(200);

    const create = await http()
      .post(base)
      .send({
        name: 'X',
        slug: 'x-project',
        description: '',
        createdBy: 'user-1',
      })
      .expect(409);
    expect(create.body.code).toBe('ORGANIZATION_SUSPENDED');

    await http().post(`${base}/${id}/archive`).expect(409);
    await http().get(`${base}/${id}`).expect(200);
  });
});
