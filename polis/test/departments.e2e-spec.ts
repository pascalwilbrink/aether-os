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
import { outboxEvents } from './outbox.js';

describe('Departments (e2e)', () => {
  let app: INestApplication<App>;
  let orgId: string;
  let owner: Client;
  let base: string;
  let projects: string;

  beforeEach(async () => {
    app = await createApp();
    orgId = (await foundOrganization(app, 'acme')).id;
    owner = await asOwner(app, orgId);
    base = `/v1/organizations/${orgId}/departments`;
    projects = `/v1/organizations/${orgId}/projects`;
  });

  afterEach(async () => {
    await app.close();
  });

  const createDepartment = async (slug = 'engineering') =>
    (
      await owner
        .post(base)
        .send({ name: 'Engineering', slug, description: 'Builds things' })
        .expect(201)
    ).body.id as string;

  const createProject = (slug: string, departmentId?: string | null) =>
    owner.post(projects).send({
      name: slug,
      slug,
      description: '',
      ...(departmentId === undefined ? {} : { departmentId }),
    });

  it('creates, fetches, changes and lists departments', async () => {
    const id = await createDepartment();

    const res = await owner.get(`${base}/${id}`).expect(200);
    expect(res.body).toEqual({
      id,
      organizationId: orgId,
      name: 'Engineering',
      slug: 'engineering',
      description: 'Builds things',
      status: 'active',
      createdBy: 'user-1',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      version: 1,
    });

    const taken = await owner
      .post(base)
      .send({ name: 'Again', slug: 'engineering', description: '' })
      .expect(409);
    expect(taken.body.code).toBe('DEPARTMENT_SLUG_TAKEN');

    const changed = await owner
      .put(`${base}/${id}`)
      .send({ name: 'R&D', description: 'Builds things' })
      .expect(200);
    expect(changed.body).toMatchObject({ name: 'R&D', version: 2 });
    // The same again: no new version.
    await owner
      .put(`${base}/${id}`)
      .send({ name: 'R&D', description: 'Builds things' })
      .expect(200)
      .expect(({ body }) => expect(body.version).toBe(2));

    await createDepartment('sales');
    const list = await owner.get(base).expect(200);
    expect(list.body.items.map((d: { slug: string }) => d.slug)).toEqual([
      'sales',
      'engineering',
    ]);

    // Every member reads them; only owners and admins change them.
    const viewer = await asMember(app, orgId, ['viewer'], { sub: 'user-2' });
    await viewer.get(`${base}/${id}`).expect(200);
    await viewer
      .post(base)
      .send({ name: 'Ops', slug: 'ops', description: '' })
      .expect(403);
    await (await asOperator(app)).get(base).expect(200);

    // Another organization's department is a 404.
    const other = await foundOrganization(app, 'globex');
    await (
      await asOwner(app, other.id)
    )
      .get(`/v1/organizations/${other.id}/departments/${id}`)
      .expect(404);
    await owner.get(`${base}/${MISSING_ID}`).expect(404);
  });

  it('puts projects in departments, moves them and lists a department’s', async () => {
    const engineering = await createDepartment();
    const sales = await createDepartment('sales');

    const app1 = (await createProject('app', engineering).expect(201)).body;
    expect(app1.departmentId).toBe(engineering);
    const loose = (await createProject('loose').expect(201)).body;
    expect(loose.departmentId).toBeNull();

    const inEngineering = await owner
      .get(projects)
      .query({ departmentId: engineering })
      .expect(200);
    expect(inEngineering.body.items.map((p: { id: string }) => p.id)).toEqual([
      app1.id,
    ]);

    const moved = await owner
      .put(`${projects}/${app1.id}/department`)
      .send({ departmentId: sales })
      .expect(200);
    expect(moved.body).toMatchObject({ departmentId: sales, version: 2 });
    // Unchanged: no new version.
    await owner
      .put(`${projects}/${app1.id}/department`)
      .send({ departmentId: sales })
      .expect(200)
      .expect(({ body }) => expect(body.version).toBe(2));
    const out = await owner
      .put(`${projects}/${app1.id}/department`)
      .send({ departmentId: null })
      .expect(200);
    expect(out.body).toMatchObject({ departmentId: null, version: 3 });

    // Another organization's department doesn't exist here.
    const other = await foundOrganization(app, 'globex');
    const foreign = (
      await (
        await asOwner(app, other.id)
      )
        .post(`/v1/organizations/${other.id}/departments`)
        .send({ name: 'X', slug: 'x', description: '' })
        .expect(201)
    ).body.id as string;
    await createProject('stray', foreign).expect(404);
    await owner
      .put(`${projects}/${app1.id}/department`)
      .send({ departmentId: foreign })
      .expect(404);

    const events = (await outboxEvents(app))
      .filter((e) => e.eventType === 'project.department-changed')
      .map((e) => [e.aggregateVersion, e.payload]);
    expect(events).toEqual([
      [2, { projectId: app1.id, from: engineering, to: sales }],
      [3, { projectId: app1.id, from: sales, to: null }],
    ]);
  });

  it('archives a department only without active projects, and keeps projects out of archived ones', async () => {
    const id = await createDepartment();
    const project = (await createProject('app', id).expect(201)).body;

    const refused = await owner.post(`${base}/${id}/archive`).expect(409);
    expect(refused.body.code).toBe('DEPARTMENT_HAS_PROJECTS');
    await owner
      .get(`${base}/${id}`)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('active'));

    // An archived project doesn't hold it back.
    await owner.post(`${projects}/${project.id}/archive`).expect(200);
    const archived = await owner.post(`${base}/${id}/archive`).expect(200);
    expect(archived.body).toMatchObject({ status: 'archived', version: 2 });
    await owner.post(`${base}/${id}/archive`).expect(200);

    const create = await createProject('late', id).expect(409);
    expect(create.body.code).toBe('DEPARTMENT_ARCHIVED');
    const loose = (await createProject('loose').expect(201)).body;
    const move = await owner
      .put(`${projects}/${loose.id}/department`)
      .send({ departmentId: id })
      .expect(409);
    expect(move.body.code).toBe('DEPARTMENT_ARCHIVED');
    const change = await owner
      .put(`${base}/${id}`)
      .send({ name: 'New', description: '' })
      .expect(409);
    expect(change.body.code).toBe('DEPARTMENT_ARCHIVED');
    // An archived project stays where it was.
    const stuck = await owner
      .put(`${projects}/${project.id}/department`)
      .send({ departmentId: null })
      .expect(409);
    expect(stuck.body.code).toBe('PROJECT_ARCHIVED');

    const events = (await outboxEvents(app))
      .filter((e) => e.eventType.startsWith('department.'))
      .map((e) => e.eventType);
    expect(events).toEqual(['department.created', 'department.archived']);
  });
});
