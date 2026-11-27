import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';

import { EventInbox, type DomainEvent } from '@episteme/core';

import { asMember, client, createApp, type Client } from './app.js';
import type { FakePolis } from './fake-polis.js';
import { outboxEvents } from './outbox.js';
import { tokens } from './tokens.js';

// Persons of Polis and the users they're linked to.
const OLGA = { person: uuidv7(), user: uuidv7() };
const ADA = { person: uuidv7(), user: uuidv7() };
const MIA = { person: uuidv7(), user: uuidv7() };
const UNLINKED = uuidv7();

describe('Knowledge (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let orgId: string;
  let olga: Client; // a member, the resource's owner
  let ada: Client; // a member, its approver
  let mia: Client; // a member, no steward
  let admin: Client;
  let viewer: Client;

  beforeEach(async () => {
    ({ app, polis } = await createApp());
    orgId = polis.organization();
    olga = await asMember(app, orgId, ['member'], { sub: OLGA.user });
    ada = await asMember(app, orgId, ['member'], { sub: ADA.user });
    mia = await asMember(app, orgId, ['member'], { sub: MIA.user });
    admin = await asMember(app, orgId, ['admin'], { sub: uuidv7() });
    viewer = await asMember(app, orgId, ['viewer'], { sub: uuidv7() });
    for (const { person, user } of [OLGA, ADA, MIA]) {
      await personEvent(person, user);
    }
    await personEvent(UNLINKED, null);
  });

  afterEach(async () => {
    await app.close();
  });

  const personEvent = (personId: string, userId: string | null) =>
    app.get(EventInbox).receive('polis', {
      eventId: uuidv7(),
      eventType: 'person.created',
      schemaVersion: 1,
      aggregateId: personId,
      aggregateVersion: 1,
      occurredAt: new Date(),
      organizationId: orgId,
      projectId: null,
      actor: null,
      payload: { personId, userId, departmentIds: [] },
    } as DomainEvent);

  const resources = () => `/v1/organizations/${orgId}/knowledge/resources`;
  const versions = (resourceId: string) =>
    `${resources()}/${resourceId}/versions`;

  const create = async (overrides: Record<string, unknown> = {}) =>
    (
      await olga
        .post(resources())
        .send({
          knowledgeType: 'policy',
          title: 'Travel policy',
          tags: ['HR', 'travel'],
          stewards: [
            { role: 'owner', personId: OLGA.person },
            { role: 'approver', personId: ADA.person },
          ],
          content: '# Travel\r\n\r\nBook economy.\n',
          ...overrides,
        })
        .expect(201)
    ).body as {
      id: string;
      version: number;
      openVersion: { id: string; revision: number };
    };

  /** Draft → submitted → approved by Ada → published by the admin. */
  const publishOpen = async (resourceId: string, versionId: string) => {
    await olga
      .post(`${versions(resourceId)}/${versionId}/submit`)
      .send({})
      .expect(200);
    await ada
      .post(`${versions(resourceId)}/${versionId}/decisions`)
      .send({ decision: 'approve' })
      .expect(200);
    return admin
      .post(`${versions(resourceId)}/${versionId}/publish`)
      .send({})
      .expect(200);
  };

  it('creates a resource with its first draft, and finds it by its metadata', async () => {
    const resource = await create();
    const got = await viewer.get(`${resources()}/${resource.id}`).expect(200);
    expect(got.body).toMatchObject({
      organizationId: orgId,
      knowledgeType: 'policy',
      title: 'Travel policy',
      tags: ['hr', 'travel'],
      status: 'draft',
      scopes: [],
      stewards: [
        { role: 'owner', personId: OLGA.person },
        { role: 'approver', personId: ADA.person },
      ],
      publishedVersion: null,
      openVersion: { number: 1, state: 'draft', revision: 1 },
      latestVersionNumber: 1,
      createdBy: { sub: OLGA.user, subType: 'user' },
      version: 1,
    });
    const version = await viewer
      .get(`${versions(resource.id)}/${resource.openVersion.id}`)
      .expect(200);
    // Canonical line endings, checksummed.
    expect(version.body.content).toBe('# Travel\n\nBook economy.\n');
    expect(version.body.checksum).toMatch(/^[0-9a-f]{64}$/);

    await create({
      title: 'Expense runbook',
      knowledgeType: 'runbook',
      tags: [],
      stewards: [{ role: 'owner', personId: OLGA.person }],
    });
    const byType = await viewer
      .get(resources())
      .query({ knowledgeType: 'runbook' })
      .expect(200);
    expect(byType.body.items.map((r: { title: string }) => r.title)).toEqual([
      'Expense runbook',
    ]);
    const byTag = await viewer
      .get(resources())
      .query({ tag: 'HR' })
      .expect(200);
    expect(byTag.body.items).toHaveLength(1);
    const byWords = await viewer
      .get(resources())
      .query({ q: 'trav' })
      .expect(200);
    expect(byWords.body.items).toHaveLength(1);
    const bySteward = await viewer
      .get(resources())
      .query({ stewardPersonId: ADA.person })
      .expect(200);
    expect(bySteward.body.items).toHaveLength(1);
    const paged = await viewer.get(resources()).query({ limit: 1 }).expect(200);
    expect(paged.body.nextCursor).not.toBeNull();
    const second = await viewer
      .get(resources())
      .query({ limit: 1, cursor: paged.body.nextCursor })
      .expect(200);
    expect(second.body.items[0].id).not.toBe(paged.body.items[0].id);

    // Viewers can't draft; another organization's resource is a 404.
    await viewer.post(resources()).send({}).expect(403);
    const other = await asMember(app, polis.organization(), ['owner']);
    await other
      .get(`/v1/organizations/${orgId}/knowledge/resources/${resource.id}`)
      .expect(404);
  });

  it('checks stewards and scopes', async () => {
    const refused = await olga
      .post(resources())
      .send({
        knowledgeType: 'faq',
        title: 'No owner',
        stewards: [{ role: 'maintainer', personId: OLGA.person }],
        content: '',
      })
      .expect(409);
    expect(refused.body.code).toBe('OWNER_REQUIRED');
    const unknown = await olga
      .post(resources())
      .send({
        knowledgeType: 'faq',
        title: 'Unknown owner',
        stewards: [{ role: 'owner', personId: uuidv7() }],
        content: '',
      })
      .expect(409);
    expect(unknown.body.code).toBe('UNKNOWN_PERSON');

    const department = polis.department(orgId);
    const archivedTeam = polis.team(orgId, 'archived');
    const bad = await olga
      .post(resources())
      .send({
        knowledgeType: 'faq',
        title: 'Scoped',
        stewards: [{ role: 'owner', personId: UNLINKED }],
        scopes: [
          { type: 'department', id: department },
          { type: 'team', id: archivedTeam },
        ],
        content: '',
      })
      .expect(400);
    expect(bad.body.errors.map((e: { pointer: string }) => e.pointer)).toEqual([
      '/scopes/1',
    ]);

    const resource = await create({
      scopes: [{ type: 'department', id: department }],
    });
    const filtered = await viewer
      .get(resources())
      .query({ scopeType: 'department', scopeId: department })
      .expect(200);
    expect(filtered.body.items.map((r: { id: string }) => r.id)).toEqual([
      resource.id,
    ]);

    // Only its owners (or org:knowledge:govern) change scopes, stewards and metadata.
    await mia
      .put(`${resources()}/${resource.id}/scopes`)
      .send({ scopes: [] })
      .expect(403);
    const team = polis.team(orgId);
    const scoped = await olga
      .put(`${resources()}/${resource.id}/scopes`)
      .set('if-match', String(resource.version))
      .send({ scopes: [{ type: 'team', id: team }] })
      .expect(200);
    expect(scoped.body).toMatchObject({
      scopes: [{ type: 'team', id: team }],
      version: 2,
    });
    await olga
      .put(`${resources()}/${resource.id}`)
      .set('if-match', '1')
      .send({ title: 'Stale' })
      .expect(412);
    const handedOver = await admin
      .put(`${resources()}/${resource.id}/stewards`)
      .send({ stewards: [{ role: 'owner', personId: MIA.person }] })
      .expect(200);
    expect(handedOver.body.stewards).toEqual([
      { role: 'owner', personId: MIA.person },
    ]);
    await olga
      .put(`${resources()}/${resource.id}`)
      .send({ title: 'Not mine' })
      .expect(403);
    await mia
      .put(`${resources()}/${resource.id}`)
      .send({ title: 'Travel rules' })
      .expect(200);
  });

  it('takes a draft through review to publication, and supersedes it with the next', async () => {
    const resource = await create();
    const v1 = resource.openVersion.id;
    const path = `${versions(resource.id)}/${v1}`;

    // The author edits the draft; someone else can't.
    await mia.put(path).send({ content: 'Not mine' }).expect(403);
    const edited = await olga
      .put(path)
      .set('if-match', '1')
      .send({
        content:
          '# Travel\n\nBook economy. Key sk-ant-abcdefghijklmnopqrstuvwxyz0123456789\n',
      })
      .expect(200);
    expect(edited.body).toMatchObject({ revision: 2 });
    expect(edited.body.content).not.toContain('sk-ant-');
    await olga
      .put(path)
      .set('if-match', '1')
      .send({ content: 'x' })
      .expect(412);

    await olga.post(`${path}/submit`).send({ comment: 'Ready' }).expect(200);
    const frozen = await olga.put(path).send({ content: 'late' }).expect(409);
    expect(frozen.body.code).toBe('NOT_A_DRAFT');

    // Asking for changes needs a comment, and sends it back to draft.
    await ada
      .post(`${path}/decisions`)
      .send({ decision: 'request_changes' })
      .expect(400);
    const back = await ada
      .post(`${path}/decisions`)
      .send({ decision: 'request_changes', comment: 'Add trains' })
      .expect(200);
    expect(back.body.state).toBe('draft');
    await olga
      .put(path)
      .send({ content: '# Travel\n\nBook economy. Trains too.\n' })
      .expect(200);
    await olga.post(`${path}/submit`).send({}).expect(200);

    // Only an approver approves; nobody publishes before.
    const notApprover = await mia
      .post(`${path}/decisions`)
      .send({ decision: 'approve' })
      .expect(403);
    expect(notApprover.body.code).toBe('FORBIDDEN');
    const early = await admin.post(`${path}/publish`).send({}).expect(409);
    expect(early.body.code).toBe('NOT_APPROVED');
    const approved = await ada
      .post(`${path}/decisions`)
      .send({ decision: 'approve' })
      .expect(200);
    expect(approved.body).toMatchObject({ state: 'approved' });
    // Members don't publish.
    await olga.post(`${path}/publish`).send({}).expect(403);
    const published = await admin.post(`${path}/publish`).send({}).expect(200);
    expect(published.body).toMatchObject({ state: 'published' });
    await admin.post(`${path}/publish`).send({}).expect(200);

    const reviews = await viewer.get(`${path}/reviews`).expect(200);
    expect(
      reviews.body.items.map(
        (r: { round: number; state: string }) => `${r.round}:${r.state}`,
      ),
    ).toEqual(['2:approved', '1:changes_requested']);
    expect(reviews.body.items[0].decisions[0]).toMatchObject({
      decision: 'approve',
      personId: ADA.person,
    });

    const active = await viewer
      .get(`${resources()}/${resource.id}`)
      .expect(200);
    expect(active.body).toMatchObject({
      status: 'active',
      publishedVersion: { id: v1, number: 1 },
      openVersion: null,
    });

    // The next version: one open at a time; published supersedes the first.
    const v2 = (
      await olga
        .post(versions(resource.id))
        .send({ content: '# Travel\n\nBook economy. Trains too. Bikes.\n' })
        .expect(201)
    ).body;
    expect(v2).toMatchObject({ number: 2, state: 'draft' });
    const twice = await olga
      .post(versions(resource.id))
      .send({ content: 'x' })
      .expect(409);
    expect(twice.body.code).toBe('DRAFT_EXISTS');
    const diff = await viewer
      .get(`${versions(resource.id)}/${v2.id}/diff`)
      .query({ against: v1 })
      .expect(200);
    expect(diff.body).toMatchObject({ fromNumber: 1, toNumber: 2 });
    expect(diff.body.diff).toContain('+Book economy. Trains too. Bikes.');
    await publishOpen(resource.id, v2.id);
    const first = await viewer.get(path).expect(200);
    expect(first.body.state).toBe('superseded');

    // Restoring the first: a new draft with its content.
    const restored = await olga
      .post(versions(resource.id))
      .send({ basedOnVersionId: v1 })
      .expect(201);
    expect(restored.body).toMatchObject({ number: 3, basedOnVersionId: v1 });
    expect(restored.body.content).toBe(first.body.content);

    const events = (await outboxEvents(app)).map((e) => e.eventType);
    expect(events).toEqual([
      'knowledge-resource.created',
      'knowledge-version.created',
      'knowledge-version.submitted',
      'knowledge-version.returned',
      'knowledge-version.submitted',
      'knowledge-version.approved',
      'knowledge-version.published',
      'knowledge-version.created',
      'knowledge-version.submitted',
      'knowledge-version.approved',
      'knowledge-version.published',
      'knowledge-version.withdrawn',
      'knowledge-version.created',
    ]);
    const publishedEvent = (await outboxEvents(app)).find(
      (e) => e.eventType === 'knowledge-version.published',
    )!;
    expect(publishedEvent).toMatchObject({
      aggregateId: resource.id,
      projectId: null,
    });
    expect(JSON.stringify(publishedEvent.payload)).not.toContain('Travel');

    const audit = await viewer
      .get(`${resources()}/${resource.id}/audit`)
      .query({ limit: 100 })
      .expect(200);
    expect(audit.body.items.map((a: { action: string }) => a.action)).toContain(
      'version_superseded',
    );
  });

  it('lets anyone with org:knowledge:publish approve a resource without approvers', async () => {
    const resource = await create({
      stewards: [{ role: 'owner', personId: OLGA.person }],
    });
    const path = `${versions(resource.id)}/${resource.openVersion.id}`;
    await olga.post(`${path}/submit`).send({}).expect(200);
    await ada
      .post(`${path}/decisions`)
      .send({ decision: 'approve' })
      .expect(403);
    // Approving a version you wrote is allowed: the admin wrote nothing here, Olga did.
    await admin
      .post(`${path}/decisions`)
      .send({ decision: 'approve' })
      .expect(200);
    const rejected = await create({
      stewards: [{ role: 'owner', personId: OLGA.person }],
    });
    const rejectedPath = `${versions(rejected.id)}/${rejected.openVersion.id}`;
    await olga.post(`${rejectedPath}/submit`).send({}).expect(200);
    const closed = await mia
      .post(`${rejectedPath}/decisions`)
      .send({ decision: 'reject', comment: 'Duplicate' })
      .expect(200);
    expect(closed.body.state).toBe('rejected');
    // A rejected version closes: a new draft can start.
    await olga
      .post(versions(rejected.id))
      .send({ basedOnVersionId: rejected.openVersion.id })
      .expect(201);
  });

  it('lets agents draft and submit, never decide or publish', async () => {
    const agent = await asMember(app, orgId, ['member'], {
      sub: 'sa-1',
      subType: 'service_account',
    });
    const created = await agent
      .post(resources())
      .send({
        knowledgeType: 'runbook',
        title: 'Restart the queue',
        stewards: [{ role: 'owner', personId: OLGA.person }],
        content: 'Steps',
      })
      .expect(201);
    const path = `${versions(created.body.id)}/${created.body.openVersion.id}`;
    await agent.post(`${path}/submit`).send({}).expect(200);
    await agent
      .post(`${path}/decisions`)
      .send({ decision: 'approve' })
      .expect(403);
    await agent.post(`${path}/publish`).send({}).expect(403);

    // Seshat reads what it indexes with its own token.
    const seshat = client(
      app,
      await tokens.service('seshat', ['platform:read']),
    );
    await seshat.get(`${resources()}/${created.body.id}`).expect(200);
    await seshat.get(path).expect(200);
    await seshat.get(resources()).expect(403);
  });

  it('archives a published resource and deletes only a never-published one', async () => {
    const resource = await create();
    await publishOpen(resource.id, resource.openVersion.id);
    const published = await admin
      .delete(`${resources()}/${resource.id}`)
      .expect(409);
    expect(published.body.code).toBe('RESOURCE_PUBLISHED');
    await mia
      .post(`${resources()}/${resource.id}/archive`)
      .send({})
      .expect(403);
    const archived = await olga
      .post(`${resources()}/${resource.id}/archive`)
      .send({ reason: 'Replaced' })
      .expect(200);
    expect(archived.body).toMatchObject({
      status: 'archived',
      publishedVersion: null,
    });
    await olga
      .post(`${resources()}/${resource.id}/archive`)
      .send({})
      .expect(200);
    const refused = await olga
      .post(versions(resource.id))
      .send({ content: 'x' })
      .expect(409);
    expect(refused.body.code).toBe('RESOURCE_ARCHIVED');
    const events = (await outboxEvents(app)).map((e) => e.eventType);
    expect(events.slice(-2)).toEqual([
      'knowledge-resource.archived',
      'knowledge-version.withdrawn',
    ]);
    // Archived resources are left out of the list unless asked for.
    expect((await viewer.get(resources()).expect(200)).body.items).toEqual([]);
    expect(
      (await viewer.get(resources()).query({ status: 'archived' }).expect(200))
        .body.items,
    ).toHaveLength(1);

    const draft = await create({ title: 'Scratch' });
    await olga.delete(`${resources()}/${draft.id}`).expect(204);
    await viewer.get(`${resources()}/${draft.id}`).expect(404);
    expect((await outboxEvents(app)).at(-1)?.eventType).toBe(
      'knowledge-resource.deleted',
    );
  });

  it('refuses changes while the organization is suspended', async () => {
    const resource = await create();
    polis.organizations.set(orgId, {
      id: orgId,
      status: 'suspended',
      version: 2,
    });
    const refused = await olga
      .put(`${resources()}/${resource.id}`)
      .send({ title: 'Renamed' })
      .expect(409);
    expect(refused.body.code).toBe('ORGANIZATION_SUSPENDED');
    await viewer.get(`${resources()}/${resource.id}`).expect(200);
    void request;
  });
});
