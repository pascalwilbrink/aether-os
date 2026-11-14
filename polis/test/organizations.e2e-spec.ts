import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { AppModule } from '../src/app.module.js';

describe('Organizations (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function createOrganization(slug = 'acme') {
    const res = await request(app.getHttpServer())
      .post('/organizations')
      .send({ name: 'Acme', slug, createdBy: 'user-1' })
      .expect(201);

    return res.body as { id: string; slug: string };
  }

  it('creates and fetches an organization by id and slug', async () => {
    const org = await createOrganization();

    const byId = await request(app.getHttpServer())
      .get(`/organizations/${org.id}`)
      .expect(200);
    expect(byId.body).toMatchObject({
      id: org.id,
      name: 'Acme',
      slug: 'acme',
      status: 'active',
    });
    expect(byId.body).not.toHaveProperty('props');

    const bySlug = await request(app.getHttpServer())
      .get('/organizations/by-slug/acme')
      .expect(200);
    expect(bySlug.body.id).toBe(org.id);

    await request(app.getHttpServer())
      .get('/organizations/unknown')
      .expect(404);
  });

  it('validates the slug and rejects duplicates', async () => {
    for (const slug of ['Acme', 'a', '-acme', 'acme-', 'ac--me', 'acme corp']) {
      await request(app.getHttpServer())
        .post('/organizations')
        .send({ name: 'Acme', slug, createdBy: 'user-1' })
        .expect(400);
    }

    await createOrganization('acme');

    const duplicate = await request(app.getHttpServer())
      .post('/organizations')
      .send({ name: 'Acme 2', slug: 'acme', createdBy: 'user-1' })
      .expect(409);
    expect(duplicate.body.error).toBe('ORGANIZATION_SLUG_TAKEN');
  });

  it('suspends and activates', async () => {
    const org = await createOrganization();
    const server = app.getHttpServer();

    const suspended = await request(server)
      .post(`/organizations/${org.id}/suspend`)
      .expect(200);
    expect(suspended.body.status).toBe('suspended');

    const again = await request(server)
      .post(`/organizations/${org.id}/suspend`)
      .expect(409);
    expect(again.body.error).toBe('ORGANIZATION_ALREADY_SUSPENDED');

    const activated = await request(server)
      .post(`/organizations/${org.id}/activate`)
      .expect(200);
    expect(activated.body.status).toBe('active');
  });

  it('lists organizations', async () => {
    await createOrganization('acme');
    await createOrganization('globex');

    const res = await request(app.getHttpServer())
      .get('/organizations?limit=1')
      .expect(200);

    expect(res.body).toMatchObject({ total: 2, limit: 1, offset: 0 });
    expect(res.body.items).toHaveLength(1);
  });
});
