import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';

import { type DomainEvent, EventInbox } from '@seshat/core';

import { asMember, asService, asTask, createApp, type Client } from './app.js';
import type { FakePolis } from './fake-polis.js';
import { outboxEvents } from './outbox.js';

const convention = {
  type: 'convention',
  title: 'Every service logs JSON lines',
  body: 'Logs go to stdout as JSON lines with the trace on each.',
  tags: ['logging'],
};

describe('Department knowledge (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let orgId: string;
  let departmentId: string;
  let projectId: string;
  let department: string;
  let project: string;
  let admin: Client;

  beforeEach(async () => {
    ({ app, polis } = await createApp());
    orgId = polis.organization();
    departmentId = polis.department(orgId);
    projectId = polis.project(orgId, 'active', departmentId);
    department = `/v1/organizations/${orgId}/departments/${departmentId}/knowledge`;
    project = `/v1/organizations/${orgId}/projects/${projectId}/knowledge`;
    admin = await asMember(app, orgId, ['admin'], { sub: 'admin-1' });
  });

  afterEach(async () => {
    await app.close();
  });

  /** A Polis event, through Seshat's inbox. */
  const polisEvent = (
    eventType: string,
    payload: object,
    aggregateId: string,
    aggregateVersion: number,
  ) =>
    app.get(EventInbox).receive('polis', {
      eventId: uuidv7(),
      eventType,
      schemaVersion: 1,
      aggregateId,
      aggregateVersion,
      occurredAt: new Date(),
      organizationId: orgId,
      projectId: aggregateId,
      actor: null,
      payload,
    } as DomainEvent);

  const ids = (body: { items: { id: string }[] }) =>
    body.items.map((item) => item.id);

  it("writes a department's knowledge, which its projects read but don't change", async () => {
    const created = await admin
      .post(`${department}/items`)
      .send(convention)
      .expect(201);
    expect(created.body).toMatchObject({
      organizationId: orgId,
      projectId: null,
      departmentId,
      status: 'accepted',
      source: { kind: 'person' },
    });
    const id = created.body.id as string;
    const own = await admin
      .post(`${project}/items`)
      .send({ ...convention, title: 'Project only' })
      .expect(201);

    // The project sees both; the department only its own.
    const projectList = await admin.get(`${project}/items`).expect(200);
    expect(new Set(ids(projectList.body))).toEqual(new Set([id, own.body.id]));
    const departmentList = await admin.get(`${department}/items`).expect(200);
    expect(ids(departmentList.body)).toEqual([id]);

    await admin.get(`${project}/items/${id}`).expect(200);
    await admin.get(`${project}/items/${id}/versions`).expect(200);
    const passages = await admin
      .get(`${project}/items/${id}/passages`)
      .expect(200);
    expect(passages.body.items[0].text).toContain('JSON lines');

    // Through the project, read-only.
    const change = await admin
      .put(`${project}/items/${id}`)
      .send({ title: 'Changed', body: 'Changed.' })
      .expect(409);
    expect(change.body.code).toBe('KNOWLEDGE_ITEM_READ_ONLY');
    await admin.post(`${project}/items/${id}/retire`).expect(409);

    // On the department, a new version.
    const changed = await admin
      .put(`${department}/items/${id}`)
      .send({ title: convention.title, body: 'Logs are JSON lines on stdout.' })
      .expect(200);
    expect(changed.body.version).toBe(2);

    // Search: the project finds both by keywords; the department its own.
    const found = await admin
      .post(`${project}/search`)
      .send({ query: 'JSON lines' })
      .expect(200);
    expect(
      found.body.results.map((r: { item: { id: string } }) => r.item.id),
    ).toContain(id);
    const departmentSearch = await admin
      .post(`${department}/search`)
      .send({ query: 'JSON lines' })
      .expect(200);
    expect(departmentSearch.body).toMatchObject({
      semantic: false,
      results: [{ item: { id } }],
    });

    // Another project, in no department, sees none of it.
    const other = `/v1/organizations/${orgId}/projects/${polis.project(orgId)}/knowledge`;
    await admin.get(`${other}/items/${id}`).expect(404);

    // Department items aren't embedded (Pylon charges a project).
    const events = (await outboxEvents(app)).filter(
      (e) => e.aggregateId === id,
    );
    expect(events[0]).toMatchObject({
      projectId: null,
      payload: { itemId: id, projectId: null, departmentId },
    });
  });

  it("takes proposals to the department from its projects' agents and people", async () => {
    const task = await asTask(app, orgId, projectId);
    const proposed = await task
      .post(`${project}/items`)
      .send({ ...convention, scope: 'department' })
      .expect(201);
    expect(proposed.body).toMatchObject({
      projectId: null,
      departmentId,
      status: 'proposed',
      source: { kind: 'task' },
    });
    // Even a person proposes, from a project.
    const byPerson = await admin
      .post(`${project}/items`)
      .send({ ...convention, title: 'Another', scope: 'department' })
      .expect(201);
    expect(byPerson.body.status).toBe('proposed');

    // Accepted on the department, by a person.
    const accepted = await admin
      .post(`${department}/items/${proposed.body.id}/accept`)
      .expect(200);
    expect(accepted.body).toMatchObject({
      status: 'accepted',
      acceptedBy: 'admin-1',
    });
    await admin
      .post(`${department}/items/${byPerson.body.id}/reject`)
      .expect(200);

    // Members read a department's knowledge; only owners and admins write it.
    const viewer = await asMember(app, orgId, ['viewer'], { sub: 'v-1' });
    await viewer.get(`${department}/items`).expect(200);
    await viewer.post(`${department}/items`).send(convention).expect(403);
    await (
      await asService(app)
    )
      .get(`${department}/items/${proposed.body.id}`)
      .expect(200);

    // A project in no department has none to propose to.
    const loose = polis.project(orgId);
    const none = await admin
      .post(`/v1/organizations/${orgId}/projects/${loose}/knowledge/items`)
      .send({ ...convention, scope: 'department' })
      .expect(409);
    expect(none.body.code).toBe('KNOWLEDGE_ITEM_INVALID');
    // `scope` is for a project's route.
    const wrong = await admin
      .post(`${department}/items`)
      .send({ ...convention, scope: 'project' })
      .expect(409);
    expect(wrong.body.code).toBe('KNOWLEDGE_ITEM_INVALID');
  });

  it("refuses writes to an archived department, and follows a project's department from Polis's events", async () => {
    const item = await admin
      .post(`${department}/items`)
      .send(convention)
      .expect(201);
    // Seen by the project (Seshat asked Polis the first time and recorded it).
    await admin.get(`${project}/items/${item.body.id}`).expect(200);

    // The project moves out of the department (Polis's event): no longer seen.
    await polisEvent(
      'project.department-changed',
      { projectId, from: departmentId, to: null },
      projectId,
      2,
    );
    await admin.get(`${project}/items/${item.body.id}`).expect(404);
    // An older event changes nothing.
    await polisEvent(
      'project.created',
      { projectId, departmentId },
      projectId,
      1,
    );
    await admin.get(`${project}/items/${item.body.id}`).expect(404);

    // A new project created in the department sees it.
    const later = uuidv7();
    await polisEvent(
      'project.created',
      { projectId: later, departmentId },
      later,
      1,
    );
    await admin
      .get(
        `/v1/organizations/${orgId}/projects/${later}/knowledge/items/${item.body.id}`,
      )
      .expect(200);

    const archived = polis.department(orgId, 'archived');
    const refused = await admin
      .post(
        `/v1/organizations/${orgId}/departments/${archived}/knowledge/items`,
      )
      .send(convention)
      .expect(409);
    expect(refused.body.code).toBe('DEPARTMENT_ARCHIVED');
  });
});
