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

describe('Projects (e2e)', () => {
  let app: INestApplication<App>;
  let orgId: string;
  let base: string;
  let owner: Client;
  let operator: Client;

  beforeEach(async () => {
    app = await createApp();

    orgId = (await foundOrganization(app, 'acme')).id;
    owner = await asOwner(app, orgId);
    operator = await asOperator(app);
    base = `/v1/organizations/${orgId}/projects`;
  });

  afterEach(async () => {
    await app.close();
  });

  // The organization's owner (project admin everywhere).
  const http = () => owner;

  async function createProject(slug = 'app'): Promise<string> {
    const res = await http()
      .post(base)
      .send({
        name: 'App',
        slug,
        description: 'The main app',
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
      version: 1,
    });

    await createProject('other');
    const list = await http().get(`${base}?limit=1`).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(typeof list.body.nextCursor).toBe('string');

    // A cursor belongs to its organization's list.
    const other = await foundOrganization(app, 'globex');
    const foreign = await (
      await asOwner(app, other.id)
    )
      .get(`/v1/organizations/${other.id}/projects`)
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
      })
      .expect(400);

    await createProject('app');

    const duplicate = await http()
      .post(base)
      .send({
        name: 'App 2',
        slug: 'app',
        description: '',
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

    await operator.post(`/v1/organizations/${orgId}/suspend`).expect(200);

    const create = await http()
      .post(base)
      .send({
        name: 'X',
        slug: 'x-project',
        description: '',
      })
      .expect(409);
    expect(create.body.code).toBe('ORGANIZATION_SUSPENDED');

    await http().post(`${base}/${id}/archive`).expect(409);
    await http().get(`${base}/${id}`).expect(200);
  });

  it('shows members only the projects they were granted', async () => {
    const app1 = await createProject('app');
    const app2 = await createProject('app-two');

    // No project roles: no projects (docs/identity.md, no access by default).
    const member = await asMember(app, orgId, ['member']);
    await member.get(base).expect(200, { items: [], nextCursor: null });
    await member.get(`${base}/${app1}`).expect(404);

    const viewer = await asMember(app, orgId, ['member'], {
      projectRoles: { [app1]: 'viewer' },
    });
    const visible = await viewer.get(base).expect(200);
    expect(visible.body.items.map((p: { id: string }) => p.id)).toEqual([app1]);
    await viewer.get(`${base}/${app1}`).expect(200);
    await viewer.get(`${base}/${app2}`).expect(404);
    await viewer.post(`${base}/${app1}/archive`).expect(403);

    // Members create projects; viewers don't.
    await member
      .post(base)
      .send({ name: 'Mine', slug: 'mine', description: '' })
      .expect(201);
    await (
      await asMember(app, orgId, ['viewer'])
    )
      .post(base)
      .send({ name: 'Nope', slug: 'nope', description: '' })
      .expect(403);

    // Platform services read any project (Hephaestus's fallback).
    await operator.get(`${base}/${app2}`).expect(200);
  });
});
