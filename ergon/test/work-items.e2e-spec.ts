import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { v7 as uuidv7 } from 'uuid';

import { EventInbox, type DomainEvent } from '@ergon/core';

import { asMember, createApp, type Client } from './app.js';
import type { FakePolis } from './fake-polis.js';
import { outboxEvents } from './outbox.js';
import { tokens } from './tokens.js';

const AGENT = '0193a1b2-c3d4-7e5f-8a9b-0000000000a1';
const AGENT_VERSION = '0193a1b2-c3d4-7e5f-8a9b-0000000000a2';
const SERVICE_ACCOUNT = 'sa-0193a1b2';
const PERSON = '0193a1b2-c3d4-7e5f-8a9b-0000000000b1';

describe('Work items (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let orgId: string;
  let projectId: string;
  let owner: Client;

  beforeEach(async () => {
    ({ app, polis } = await createApp());
    orgId = polis.organization();
    projectId = polis.project(orgId);
    owner = await asMember(app, orgId, ['owner'], { sub: 'owner-1' });
    // Whom work can be assigned to, as Polis and Agora announce them.
    await personEvent('person.created', PERSON);
    await agentEvent('agent.created', AGENT);
  });

  /** An event from Polis or Agora, as the consumer hands it over. */
  const deliver = (
    source: string,
    eventType: string,
    aggregateId: string,
    aggregateVersion: number,
    payload: unknown,
    organizationId = orgId,
  ) =>
    app.get(EventInbox).receive(source, {
      eventId: uuidv7(),
      eventType,
      schemaVersion: 1,
      aggregateId,
      aggregateVersion,
      occurredAt: new Date().toISOString(),
      organizationId,
      projectId: null,
      actor: null,
      payload,
    } as DomainEvent);

  const personEvent = (
    eventType: string,
    personId: string,
    version = 1,
    organizationId = orgId,
  ) =>
    deliver(
      'polis',
      eventType,
      personId,
      version,
      eventType === 'person.deleted'
        ? { personId }
        : { personId, userId: null, departmentIds: [] },
      organizationId,
    );

  const agentEvent = (eventType: string, agentId: string, version = 1) =>
    deliver(
      'agora',
      eventType,
      agentId,
      version,
      eventType === 'agent.archived'
        ? { agentId }
        : {
            agentId,
            name: 'Reporter',
            description: '',
            createdBy: 'owner-1',
            createdAt: new Date().toISOString(),
          },
    );

  afterEach(async () => {
    await app.close();
  });

  const base = () => `/v1/organizations/${orgId}`;
  const items = () => `${base()}/work-items`;

  const create = async (
    overrides: Record<string, unknown> = {},
    client: Client = owner,
  ) =>
    (
      await client
        .post(items())
        .send({
          type: 'task',
          title: 'Write the report',
          projectId,
          ...overrides,
        })
        .expect(201)
    ).body;

  const act = (id: string, action: string, client: Client = owner) =>
    client.post(`${items()}/${id}/transitions`).send({ action });

  const block = (from: string, to: string, kind = 'blocks') =>
    owner
      .post(`${base()}/work-dependencies`)
      .send({ kind, fromWorkItemId: from, toWorkItemId: to });

  describe('work items', () => {
    it('creates one with defaults, records it and announces it', async () => {
      const item = await create({ description: 'For the board' });
      expect(item).toMatchObject({
        organizationId: orgId,
        projectId,
        parentId: null,
        type: 'task',
        title: 'Write the report',
        description: 'For the board',
        status: 'backlog',
        blocked: false,
        priority: 'medium',
        needsReview: false,
        requirements: [],
        expectedOutcome: null,
        source: { kind: 'person', reference: null },
        responsible: null,
        createdBy: { sub: 'owner-1', subType: 'user', agentId: null },
        version: 1,
      });

      await owner.get(`${items()}/${item.id}`).expect(200, item);
      const page = await owner.get(items()).query({ projectId }).expect(200);
      expect(page.body.items.map((i: { id: string }) => i.id)).toEqual([
        item.id,
      ]);
      // Work outside any project is listed separately.
      await owner
        .get(items())
        .expect(200)
        .expect(({ body }) => expect(body.items).toEqual([]));

      const activity = await owner
        .get(`${items()}/${item.id}/activity`)
        .expect(200);
      expect(activity.body.items).toMatchObject([
        { kind: 'created', details: { status: 'backlog' } },
      ]);

      const [event] = await outboxEvents(app);
      expect(event).toMatchObject({
        eventType: 'work-item.created',
        aggregateId: item.id,
        aggregateVersion: 1,
        organizationId: orgId,
        projectId,
        payload: { workItem: { id: item.id, status: 'backlog' } },
      });
    });

    it('keeps work outside any project to the organization', async () => {
      const member = await asMember(app, orgId, ['member']);
      const item = await create({ projectId: null }, member);
      expect(item.projectId).toBeNull();
      const page = await member.get(items()).expect(200);
      expect(page.body.items.map((i: { id: string }) => i.id)).toEqual([
        item.id,
      ]);

      const viewer = await asMember(app, orgId, ['viewer']);
      await viewer.get(`${items()}/${item.id}`).expect(200);
      await viewer
        .post(items())
        .send({ type: 'task', title: 'Nope' })
        .expect(403);
      await act(item.id, 'plan', viewer).expect(403);

      // A task token is limited to its project, even with organization roles.
      const task = request.agent(app.getHttpServer()).set(
        'authorization',
        `Bearer ${await tokens.user({
          subType: 'service_account',
          organizationId: orgId,
          roles: ['admin'],
          projectId,
        })}`,
      );
      await task.get(`${items()}/${item.id}`).expect(403);
    });

    it('checks permissions in the project', async () => {
      const item = await create();
      const viewer = await asMember(app, orgId, ['member'], {
        projectRoles: { [projectId]: 'viewer' },
      });
      await viewer.get(`${items()}/${item.id}`).expect(200);
      await act(item.id, 'plan', viewer).expect(403);
      await viewer
        .post(items())
        .send({ type: 'task', title: 'Nope', projectId })
        .expect(403);

      // A project the caller can't see: its work isn't there.
      const outsider = await asMember(app, orgId, ['member']);
      await outsider.get(`${items()}/${item.id}`).expect(404);
      await outsider.get(items()).query({ projectId }).expect(404);

      // Another organization's work isn't there either.
      const otherOrg = polis.organization();
      const stranger = await asMember(app, otherOrg, ['owner']);
      await stranger
        .get(`/v1/organizations/${otherOrg}/work-items/${item.id}`)
        .expect(404);
    });

    it('records an agent and its task as the actor', async () => {
      const agent = request.agent(app.getHttpServer()).set(
        'authorization',
        `Bearer ${await tokens.sign({
          sub: SERVICE_ACCOUNT,
          sub_type: 'service_account',
          org_id: orgId,
          org_roles: ['member'],
          project_roles: { [projectId]: 'editor' },
          project_id: projectId,
          task_id: 'task-1',
          agent_id: AGENT,
          agent_version_id: AGENT_VERSION,
          scope: 'api',
        })}`,
      );
      const item = await create({}, agent);
      expect(item.source).toEqual({ kind: 'agent', reference: null });
      expect(item.createdBy).toEqual({
        sub: SERVICE_ACCOUNT,
        subType: 'service_account',
        agentId: AGENT,
        agentVersionId: AGENT_VERSION,
        taskId: 'task-1',
      });
    });

    it('refuses writes in a suspended organization or archived project', async () => {
      const item = await create();
      polis.projects.get(projectId)!.status = 'archived';
      const archived = await act(item.id, 'plan').expect(409);
      expect(archived.body.code).toBe('PROJECT_ARCHIVED');
      polis.organizations.get(orgId)!.status = 'suspended';
      const suspended = await owner
        .post(items())
        .send({ type: 'task', title: 'Later' })
        .expect(409);
      expect(suspended.body.code).toBe('ORGANIZATION_SUSPENDED');
    });

    it('replaces the content, and only announces real changes', async () => {
      const item = await create();
      const content = {
        type: 'bug',
        title: 'Fix the report',
        priority: 'high',
        requirements: [{ key: 'REQ-1', description: 'Totals add up' }],
        dueAt: '2027-01-15T12:00:00.000Z',
      };
      const updated = await owner
        .put(`${items()}/${item.id}`)
        .set('if-match', '"1"')
        .send(content)
        .expect(200);
      expect(updated.body).toMatchObject({ ...content, version: 2 });

      // The same again: nothing changes.
      await owner
        .put(`${items()}/${item.id}`)
        .send(content)
        .expect(200)
        .expect(({ body }) => expect(body.version).toBe(2));
      // A stale version.
      const stale = await owner
        .put(`${items()}/${item.id}`)
        .set('if-match', '1')
        .send({ ...content, title: 'Lost update' })
        .expect(412);
      expect(stale.body.code).toBe('VERSION_MISMATCH');

      const activity = await owner
        .get(`${items()}/${item.id}/activity`)
        .expect(200);
      expect(activity.body.items.at(-1)).toMatchObject({
        kind: 'updated',
        details: {
          fields: ['type', 'title', 'priority', 'requirements', 'dueAt'],
        },
      });
      const events = await outboxEvents(app);
      expect(events.map((e) => e.eventType)).toEqual([
        'work-item.created',
        'work-item.updated',
      ]);

      await act(item.id, 'cancel').expect(200);
      const closed = await owner
        .put(`${items()}/${item.id}`)
        .send(content)
        .expect(409);
      expect(closed.body.code).toBe('WORK_ITEM_CLOSED');
    });
  });

  describe('lifecycle', () => {
    it('moves through review to done, and can be reopened', async () => {
      const item = await create({ status: 'todo', needsReview: true });
      expect(item.status).toBe('todo');

      const started = await act(item.id, 'start').expect(200);
      expect(started.body.status).toBe('in_progress');
      expect(started.body.startedAt).not.toBeNull();

      const complete = await act(item.id, 'complete').expect(409);
      expect(complete.body.code).toBe('REVIEW_REQUIRED');

      await act(item.id, 'submit').expect(200);
      await act(item.id, 'request_changes').expect(200);
      await act(item.id, 'submit').expect(200);
      const done = await act(item.id, 'approve').expect(200);
      expect(done.body).toMatchObject({ status: 'done', version: 6 });
      expect(done.body.completedAt).not.toBeNull();

      const reopened = await act(item.id, 'reopen').expect(200);
      expect(reopened.body).toMatchObject({
        status: 'in_progress',
        completedAt: null,
        startedAt: started.body.startedAt,
      });

      const events = (await outboxEvents(app)).filter(
        (e) => e.eventType === 'work-item.status-changed',
      );
      expect(
        events.map((e) => {
          const p = e.payload as { from: string; to: string; action: string };
          return `${p.from}>${p.action}>${p.to}`;
        }),
      ).toEqual([
        'todo>start>in_progress',
        'in_progress>submit>in_review',
        'in_review>request_changes>in_progress',
        'in_progress>submit>in_review',
        'in_review>approve>done',
        'done>reopen>in_progress',
      ]);
    });

    it('refuses what the status does not allow, and stale versions', async () => {
      const item = await create();
      const invalid = await act(item.id, 'start').expect(409);
      expect(invalid.body.code).toBe('INVALID_TRANSITION');

      await owner
        .post(`${items()}/${item.id}/transitions`)
        .set('if-match', '7')
        .send({ action: 'plan' })
        .expect(412);
      await owner
        .post(`${items()}/${item.id}/transitions`)
        .send({ action: 'teleport' })
        .expect(400);

      const planned = await owner
        .post(`${items()}/${item.id}/transitions`)
        .set('if-match', '1')
        .send({ action: 'plan', reason: 'Next sprint' })
        .expect(200);
      expect(planned.body).toMatchObject({ status: 'todo', version: 2 });
      const activity = await owner
        .get(`${items()}/${item.id}/activity`)
        .expect(200);
      expect(activity.body.items.at(-1)).toMatchObject({
        kind: 'status_changed',
        details: {
          from: 'backlog',
          to: 'todo',
          action: 'plan',
          reason: 'Next sprint',
        },
      });
    });

    it("keeps children in their parent's project and the parent open until they finish", async () => {
      const parent = await create({ status: 'todo', type: 'initiative' });
      const child = await create({ parentId: parent.id, projectId: undefined });
      expect(child).toMatchObject({ parentId: parent.id, projectId });

      const otherProject = polis.project(orgId);
      await owner
        .post(items())
        .send({
          type: 'task',
          title: 'Elsewhere',
          parentId: parent.id,
          projectId: otherProject,
        })
        .expect(400);

      const children = await owner
        .get(items())
        .query({ projectId, parentId: parent.id })
        .expect(200);
      expect(children.body.items.map((i: { id: string }) => i.id)).toEqual([
        child.id,
      ]);

      await act(parent.id, 'start').expect(200);
      const open = await act(parent.id, 'complete').expect(409);
      expect(open.body.code).toBe('CHILDREN_OPEN');
      await act(child.id, 'cancel').expect(200);
      await act(parent.id, 'complete').expect(200);

      const closed = await owner
        .post(items())
        .send({ type: 'task', title: 'Too late', parentId: parent.id })
        .expect(409);
      expect(closed.body.code).toBe('WORK_ITEM_CLOSED');
    });
  });

  describe('assignments', () => {
    const assignments = (id: string) => `${items()}/${id}/assignments`;

    it('keeps one responsible assignee, ending the old one on reassignment', async () => {
      const item = await create();
      const first = await owner
        .post(assignments(item.id))
        .send({
          assignee: { kind: 'person', id: PERSON },
          role: 'responsible',
          reason: 'Knows the numbers',
        })
        .expect(201);
      expect(first.body).toMatchObject({
        workItemId: item.id,
        assignee: { kind: 'person', id: PERSON, versionId: null },
        role: 'responsible',
        status: 'active',
        reason: 'Knows the numbers',
        assignedBy: { sub: 'owner-1' },
        endedAt: null,
      });
      await owner
        .post(assignments(item.id))
        .send({ assignee: { kind: 'person', id: PERSON }, role: 'responsible' })
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('ALREADY_ASSIGNED'));

      const second = await owner
        .post(assignments(item.id))
        .send({
          assignee: { kind: 'agent', id: AGENT, versionId: AGENT_VERSION },
          role: 'responsible',
        })
        .expect(201);
      await owner
        .post(assignments(item.id))
        .send({ assignee: { kind: 'person', id: PERSON }, role: 'reviewer' })
        .expect(201);

      const got = await owner.get(`${items()}/${item.id}`).expect(200);
      expect(got.body.responsible).toEqual({
        kind: 'agent',
        id: AGENT,
        versionId: AGENT_VERSION,
      });

      const history = await owner.get(assignments(item.id)).expect(200);
      expect(history.body.items).toHaveLength(3);
      const ended = history.body.items.find(
        (a: { id: string }) => a.id === first.body.id,
      );
      expect(ended).toMatchObject({
        status: 'ended',
        endReason: 'Reassigned',
        endedBy: { sub: 'owner-1' },
      });
      const active = await owner
        .get(assignments(item.id))
        .query({ status: 'active' })
        .expect(200);
      expect(active.body.items).toHaveLength(2);

      const events = (await outboxEvents(app)).filter(
        (e) => e.eventType === 'work-assignment.changed',
      );
      expect(
        events.map((e) => {
          const p = e.payload as { change: string; assignee: { id: string } };
          return `${p.change} ${p.assignee.id}`;
        }),
      ).toEqual([
        `started ${PERSON}`,
        `ended ${PERSON}`,
        `started ${AGENT}`,
        `started ${PERSON}`,
      ]);
      expect(events[2]).toMatchObject({
        aggregateId: second.body.id,
        aggregateVersion: 1,
        projectId,
        payload: {
          workItemId: item.id,
          workItemTitle: 'Write the report',
          role: 'responsible',
        },
      });
    });

    it('ends an assignment once, and assigns nothing on closed work', async () => {
      const item = await create();
      const assignment = await owner
        .post(assignments(item.id))
        .send({ assignee: { kind: 'agent', id: AGENT }, role: 'contributor' })
        .expect(201);
      const ended = await owner
        .post(`${assignments(item.id)}/${assignment.body.id}/end`)
        .send({ reason: 'Not needed' })
        .expect(200);
      expect(ended.body).toMatchObject({
        status: 'ended',
        endReason: 'Not needed',
      });
      await owner
        .post(`${assignments(item.id)}/${assignment.body.id}/end`)
        .send({})
        .expect(200, ended.body);

      const activity = await owner
        .get(`${items()}/${item.id}/activity`)
        .expect(200);
      expect(activity.body.items.map((a: { kind: string }) => a.kind)).toEqual([
        'created',
        'assignment_started',
        'assignment_ended',
      ]);

      await act(item.id, 'cancel').expect(200);
      await owner
        .post(assignments(item.id))
        .send({ assignee: { kind: 'person', id: PERSON }, role: 'responsible' })
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('WORK_ITEM_CLOSED'));
    });
  });

  describe('assignees', () => {
    const assignments = (id: string) => `${items()}/${id}/assignments`;
    const assign = (id: string, kind: string, assigneeId: string) =>
      owner
        .post(assignments(id))
        .send({ assignee: { kind, id: assigneeId }, role: 'contributor' });

    it('assigns only persons and agents Ergon knows in the organization', async () => {
      const item = await create();
      const unknown = await assign(item.id, 'person', uuidv7()).expect(409);
      expect(unknown.body.code).toBe('UNKNOWN_ASSIGNEE');
      // Another organization's person isn't this one's.
      const elsewhere = uuidv7();
      await personEvent('person.created', elsewhere, 1, polis.organization());
      await assign(item.id, 'person', elsewhere).expect(409);
      await assign(item.id, 'agent', uuidv7()).expect(409);
      await owner
        .post(assignments(item.id))
        .send({ assignee: { kind: 'user', id: 'user-7' }, role: 'responsible' })
        .expect(400);

      // Known once Polis announces them, whichever event comes first.
      const later = uuidv7();
      await personEvent('person.updated', later, 2);
      await assign(item.id, 'person', later).expect(201);
    });

    it('ends the assignments of a deleted person or an archived agent', async () => {
      const item = await create();
      const person = await assign(item.id, 'person', PERSON).expect(201);
      const agent = await owner
        .post(assignments(item.id))
        .send({ assignee: { kind: 'agent', id: AGENT }, role: 'responsible' })
        .expect(201);

      await personEvent('person.deleted', PERSON, 2);
      await agentEvent('agent.archived', AGENT, 2);
      // A late update doesn't bring the person back.
      await personEvent('person.updated', PERSON, 1);

      const history = await owner.get(assignments(item.id)).expect(200);
      const byId = new Map(
        history.body.items.map((a: { id: string }) => [a.id, a]),
      );
      expect(byId.get(person.body.id)).toMatchObject({
        status: 'ended',
        endReason: 'Person deleted',
        endedBy: null,
      });
      expect(byId.get(agent.body.id)).toMatchObject({
        status: 'ended',
        endReason: 'Agent archived',
      });
      await owner
        .get(`${items()}/${item.id}`)
        .expect(({ body }) => expect(body.responsible).toBeNull());

      const again = await assign(item.id, 'person', PERSON).expect(409);
      expect(again.body.code).toBe('UNKNOWN_ASSIGNEE');
      const archived = await assign(item.id, 'agent', AGENT).expect(409);
      expect(archived.body.code).toBe('AGENT_ARCHIVED');

      const activity = await owner
        .get(`${items()}/${item.id}/activity`)
        .expect(200);
      expect(activity.body.items.at(-1)).toMatchObject({
        kind: 'assignment_ended',
        actor: null,
        details: { reason: 'Agent archived' },
      });
      const ended = (await outboxEvents(app)).filter(
        (e) =>
          e.eventType === 'work-assignment.changed' &&
          (e.payload as { change: string }).change === 'ended',
      );
      expect(ended.map((e) => e.actor)).toEqual([null, null]);
    });
  });

  describe('dependencies', () => {
    it('derives Blocked from blockers that are not finished', async () => {
      const first = await create({ status: 'todo', title: 'First' });
      const second = await create({ title: 'Second' });
      const dependency = await block(first.id, second.id).expect(201);
      expect(dependency.body).toMatchObject({
        kind: 'blocks',
        fromWorkItemId: first.id,
        toWorkItemId: second.id,
      });

      await owner
        .get(`${items()}/${second.id}`)
        .expect(({ body }) => expect(body.blocked).toBe(true));
      await owner
        .get(`${items()}/${first.id}`)
        .expect(({ body }) => expect(body.blocked).toBe(false));
      const page = await owner.get(items()).query({ projectId }).expect(200);
      expect(
        page.body.items.map((i: { title: string; blocked: boolean }) => [
          i.title,
          i.blocked,
        ]),
      ).toEqual([
        ['Second', true],
        ['First', false],
      ]);

      await act(first.id, 'start').expect(200);
      await act(first.id, 'complete').expect(200);
      await owner
        .get(`${items()}/${second.id}`)
        .expect(({ body }) => expect(body.blocked).toBe(false));

      for (const id of [first.id, second.id]) {
        const list = await owner
          .get(`${items()}/${id}/dependencies`)
          .expect(200);
        expect(list.body.items.map((d: { id: string }) => d.id)).toEqual([
          dependency.body.id,
        ]);
      }
    });

    it('refuses cycles, self-dependencies and duplicates', async () => {
      const [a, b, c] = [await create(), await create(), await create()];
      await block(a.id, b.id).expect(201);
      await block(b.id, c.id).expect(201);
      for (const [from, to] of [
        [c.id, a.id],
        [b.id, a.id],
      ]) {
        const cycle = await block(from, to).expect(409);
        expect(cycle.body.code).toBe('DEPENDENCY_CYCLE');
      }
      const self = await block(a.id, a.id).expect(409);
      expect(self.body.code).toBe('SELF_DEPENDENCY');
      const again = await block(a.id, b.id).expect(409);
      expect(again.body.code).toBe('DEPENDENCY_EXISTS');

      // relates_to has no direction: the reverse is the same edge.
      const related = await block(c.id, a.id, 'relates_to').expect(201);
      expect([related.body.fromWorkItemId, related.body.toWorkItemId]).toEqual(
        [a.id, c.id].sort((x, y) => x.localeCompare(y)),
      );
      const reverse = await block(a.id, c.id, 'relates_to').expect(409);
      expect(reverse.body.code).toBe('DEPENDENCY_EXISTS');
      // And it blocks nothing.
      await owner
        .get(`${items()}/${a.id}`)
        .expect(({ body }) => expect(body.blocked).toBe(false));
    });

    it('removes a dependency, recorded on both work items', async () => {
      const [a, b] = [await create(), await create()];
      const dependency = await block(a.id, b.id).expect(201);
      await owner
        .delete(`${base()}/work-dependencies/${dependency.body.id}`)
        .expect(204);
      await owner
        .delete(`${base()}/work-dependencies/${dependency.body.id}`)
        .expect(404);
      await owner
        .get(`${items()}/${b.id}`)
        .expect(({ body }) => expect(body.blocked).toBe(false));
      for (const id of [a.id, b.id]) {
        const activity = await owner
          .get(`${items()}/${id}/activity`)
          .expect(200);
        expect(
          activity.body.items.map((x: { kind: string }) => x.kind),
        ).toEqual(['created', 'dependency_added', 'dependency_removed']);
      }
      const events = (await outboxEvents(app)).filter((e) =>
        e.eventType.startsWith('work-dependency.'),
      );
      expect(events.map((e) => [e.eventType, e.aggregateVersion])).toEqual([
        ['work-dependency.created', 1],
        ['work-dependency.removed', 2],
      ]);
    });

    it('crosses projects only with write access to both', async () => {
      const otherProject = polis.project(orgId);
      const here = await create();
      const there = await create({ projectId: otherProject });
      const editor = await asMember(app, orgId, ['member'], {
        projectRoles: { [projectId]: 'editor', [otherProject]: 'viewer' },
      });
      await editor
        .post(`${base()}/work-dependencies`)
        .send({
          kind: 'blocks',
          fromWorkItemId: here.id,
          toWorkItemId: there.id,
        })
        .expect(403);
      await block(here.id, there.id).expect(201);
      await editor
        .get(`${items()}/${there.id}`)
        .expect(({ body }) => expect(body.blocked).toBe(true));
    });
  });
});
