import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { configureHttpApp } from '@hephaestus/core';

import { AppModule } from '../src/app.module.js';

describe('Projects (e2e)', () => {
  let app: INestApplication<App>;
  let orgId: string;
  let base: string;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureHttpApp(moduleRef.createNestApplication());
    await app.init();

    const org = await request(app.getHttpServer())
      .post('/v1/organizations')
      .send({ name: 'Acme', slug: 'acme', createdBy: 'user-1' })
      .expect(201);
    orgId = org.body.id;
    base = `/v1/organizations/${orgId}/projects`;
  });

  afterEach(async () => {
    await app.close();
  });

  async function createProject(slug = 'app'): Promise<string> {
    const res = await request(app.getHttpServer())
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

    const res = await request(app.getHttpServer())
      .get(`${base}/${id}`)
      .expect(200);
    expect(res.body).toMatchObject({
      id,
      organizationId: orgId,
      name: 'App',
      slug: 'app',
      status: 'active',
    });
    expect(res.body).not.toHaveProperty('props');

    await createProject('other');
    const list = await request(app.getHttpServer())
      .get(`${base}?limit=1`)
      .expect(200);
    expect(typeof list.body.nextCursor).toBe('string');
    expect(list.body.items).toHaveLength(1);

    await request(app.getHttpServer()).get(`${base}/unknown`).expect(404);
    await request(app.getHttpServer())
      .get('/v1/organizations/unknown/projects')
      .expect(404);
  });

  it('validates input and rejects duplicate slugs', async () => {
    await request(app.getHttpServer())
      .post(base)
      .send({
        name: 'App',
        slug: 'Bad Slug',
        description: '',
        createdBy: 'user-1',
      })
      .expect(400);

    await createProject('app');

    const duplicate = await request(app.getHttpServer())
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

  it('archives a project once', async () => {
    const id = await createProject();

    await request(app.getHttpServer())
      .post(`${base}/${id}/archive`)
      .expect(204);

    const res = await request(app.getHttpServer())
      .get(`${base}/${id}`)
      .expect(200);
    expect(res.body.status).toBe('archived');

    const again = await request(app.getHttpServer())
      .post(`${base}/${id}/archive`)
      .expect(409);
    expect(again.body.code).toBe('PROJECT_ARCHIVED');
  });

  it('blocks writes for a suspended organization', async () => {
    const id = await createProject();

    await request(app.getHttpServer())
      .post(`/v1/organizations/${orgId}/suspend`)
      .expect(200);

    const create = await request(app.getHttpServer())
      .post(base)
      .send({
        name: 'X',
        slug: 'x-project',
        description: '',
        createdBy: 'user-1',
      })
      .expect(409);
    expect(create.body.code).toBe('ORGANIZATION_SUSPENDED');

    await request(app.getHttpServer())
      .post(`${base}/${id}/archive`)
      .expect(409);
    await request(app.getHttpServer()).get(`${base}/${id}`).expect(200);
  });
});
