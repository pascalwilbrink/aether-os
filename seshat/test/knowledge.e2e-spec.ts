import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';

import { DocumentFileError, DocumentIndexer } from '@seshat/knowledge';

import { asMember, asTask, createApp, TASK_ID, type Client } from './app.js';
import type { FakeFiles } from './fake-files.js';
import type { FakePolis } from './fake-polis.js';
import { outboxEvents } from './outbox.js';

const MISSING_ID = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

const decision = {
  type: 'decision',
  title: 'Use Postgres for everything',
  body: 'We keep one database engine: Postgres, with pgvector for embeddings.',
  tags: ['database'],
};

describe('Knowledge (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let files: FakeFiles;
  let orgId: string;
  let projectId: string;
  let base: string;
  let admin: Client;

  beforeEach(async () => {
    ({ app, polis, files } = await createApp());
    orgId = polis.organization();
    projectId = polis.project(orgId);
    base = `/v1/organizations/${orgId}/projects/${projectId}/knowledge`;
    admin = await asMember(app, orgId, ['admin'], { sub: 'admin-1' });
  });

  afterEach(async () => {
    await app.close();
  });

  const task = () => asTask(app, orgId, projectId);
  const indexDocuments = () => app.get(DocumentIndexer).drain();

  async function search(client: Client, body: object) {
    const res = await client.post(`${base}/search`).send(body).expect(200);
    return res.body.results as {
      item: { id: string; status: string };
      passage: string;
      score: number;
    }[];
  }

  it("accepts a person's item at once and keeps each edit as a version", async () => {
    const created = await admin
      .post(`${base}/items`)
      .send(decision)
      .expect(201);
    expect(created.body).toMatchObject({
      organizationId: orgId,
      projectId,
      type: 'decision',
      title: decision.title,
      status: 'accepted',
      version: 1,
      tags: ['database'],
      source: { kind: 'person', taskId: null },
      createdBy: 'admin-1',
      acceptedBy: 'admin-1',
      document: null,
    });
    const id = created.body.id;

    const updated = await admin
      .put(`${base}/items/${id}`)
      .send({ title: 'Use Postgres', body: 'One engine.' })
      .expect(200);
    expect(updated.body).toMatchObject({ version: 2, title: 'Use Postgres' });
    // Left out, tags are kept.
    expect(updated.body.tags).toEqual(['database']);

    const versions = await admin
      .get(`${base}/items/${id}/versions`)
      .expect(200);
    expect(
      versions.body.items.map((v: { version: number; title: string }) => [
        v.version,
        v.title,
      ]),
    ).toEqual([
      [2, 'Use Postgres'],
      [1, decision.title],
    ]);

    const list = await admin.get(`${base}/items?type=decision`).expect(200);
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([id]);
    await admin.get(`${base}/items?type=fact`).expect(200, {
      items: [],
      nextCursor: null,
    });
    await admin.get(`${base}/items/${MISSING_ID}`).expect(404);

    const events = await outboxEvents(app);
    expect(events.map((e) => [e.eventType, e.aggregateVersion])).toEqual([
      ['knowledge-item.accepted', 1],
      ['knowledge-item.indexed', 2],
      ['knowledge-item.updated', 3],
      ['knowledge-item.indexed', 4],
    ]);
    expect(events[0]).toMatchObject({
      aggregateId: id,
      organizationId: orgId,
      projectId,
      payload: {
        itemId: id,
        projectId,
        type: 'decision',
        status: 'accepted',
        version: 1,
        sourceKind: 'person',
        supersededBy: null,
      },
    });
  });

  it("keeps an agent's item as a proposal until a person accepts it, superseding the one it replaces", async () => {
    const old = await admin.post(`${base}/items`).send(decision).expect(201);
    const agent = await task();

    const proposal = await agent
      .post(`${base}/items`)
      .send({
        type: 'decision',
        title: 'Use Postgres and Redis',
        body: 'Redis for queues.',
        supersedes: old.body.id,
      })
      .expect(201);
    expect(proposal.body).toMatchObject({
      status: 'proposed',
      source: { kind: 'task', taskId: TASK_ID },
      createdBy: 'service-account-1',
      supersedes: old.body.id,
      acceptedBy: null,
    });
    const id = proposal.body.id;

    // Agents may change their proposals, but not accept them or accepted items.
    await agent
      .put(`${base}/items/${id}`)
      .send({ title: 'Use Postgres and Valkey', body: 'Valkey for queues.' })
      .expect(200);
    await agent.post(`${base}/items/${id}/accept`).expect(403);
    const edit = await agent
      .put(`${base}/items/${old.body.id}`)
      .send({ title: 'x', body: 'y' })
      .expect(409);
    expect(edit.body.code).toBe('KNOWLEDGE_ITEM_INVALID');

    // Proposals aren't found unless asked for.
    expect(await search(admin, { query: 'valkey' })).toEqual([]);
    const proposed = await search(admin, {
      query: 'valkey',
      includeProposed: true,
    });
    expect(proposed.map((r) => [r.item.id, r.item.status])).toEqual([
      [id, 'proposed'],
    ]);

    const accepted = await admin.post(`${base}/items/${id}/accept`).expect(200);
    expect(accepted.body).toMatchObject({
      status: 'accepted',
      acceptedBy: 'admin-1',
      version: 2,
    });
    // Accepting again changes nothing.
    await admin.post(`${base}/items/${id}/accept`).expect(200);

    const replaced = await admin
      .get(`${base}/items/${old.body.id}`)
      .expect(200);
    expect(replaced.body).toMatchObject({
      status: 'superseded',
      supersededBy: id,
    });
    expect((await search(admin, { query: 'valkey' })).length).toBe(1);
    expect(await search(admin, { query: 'pgvector' })).toEqual([]);

    // A finished item can't change or come back.
    const again = await admin
      .put(`${base}/items/${old.body.id}`)
      .send({ title: 'x', body: 'y' })
      .expect(409);
    expect(again.body.code).toBe('KNOWLEDGE_ITEM_INVALID_TRANSITION');

    const types = (await outboxEvents(app))
      .filter((e) => e.aggregateId === old.body.id)
      .map((e) => e.eventType);
    expect(types).toEqual([
      'knowledge-item.accepted',
      'knowledge-item.indexed',
      'knowledge-item.superseded',
    ]);
  });

  it('rejects proposals and retires accepted items', async () => {
    const proposal = await (
      await task()
    )
      .post(`${base}/items`)
      .send({ type: 'fact', title: 'Deploys on Fridays', body: 'Always.' })
      .expect(201);
    await admin.post(`${base}/items/${proposal.body.id}/reject`).expect(200);
    const late = await admin
      .post(`${base}/items/${proposal.body.id}/accept`)
      .expect(409);
    expect(late.body.code).toBe('KNOWLEDGE_ITEM_INVALID_TRANSITION');

    const fact = await admin
      .post(`${base}/items`)
      .send({ type: 'fact', title: 'Staging URL', body: 'staging.example' })
      .expect(201);
    expect((await search(admin, { query: 'staging' })).length).toBe(1);
    const retired = await admin
      .post(`${base}/items/${fact.body.id}/retire`)
      .expect(200);
    expect(retired.body.status).toBe('retired');
    expect(await search(admin, { query: 'staging' })).toEqual([]);

    // A person can't accept an item that supersedes nothing accepted.
    await admin
      .post(`${base}/items`)
      .send({ ...decision, supersedes: fact.body.id })
      .expect(409);
  });

  it('checks permissions and the project', async () => {
    const viewer = await asMember(app, orgId, ['member'], {
      projectRoles: { [projectId]: 'viewer' },
    });
    const editor = await asMember(app, orgId, ['member'], {
      projectRoles: { [projectId]: 'editor' },
    });
    const outsider = await asMember(app, orgId, ['member']);

    const item = await editor.post(`${base}/items`).send(decision).expect(201);
    // An editor writes accepted knowledge but doesn't approve others'.
    expect(item.body.status).toBe('accepted');
    await editor.post(`${base}/items/${item.body.id}/retire`).expect(403);

    await viewer.get(`${base}/items/${item.body.id}`).expect(200);
    await viewer.post(`${base}/search`).send({ query: 'postgres' }).expect(200);
    await viewer.post(`${base}/items`).send(decision).expect(403);
    // Without access to the project, it isn't there.
    await outsider.get(`${base}/items`).expect(404);

    // A task only reaches its own project.
    const other = polis.project(orgId);
    await (
      await task()
    )
      .get(`/v1/organizations/${orgId}/projects/${other}/knowledge/items`)
      .expect(404);
    // Another project's item is a 404.
    await admin
      .get(
        `/v1/organizations/${orgId}/projects/${other}/knowledge/items/${item.body.id}`,
      )
      .expect(404);

    // No writes to an archived project; reads still work.
    polis.projects.get(projectId)!.status = 'archived';
    const archived = await admin
      .post(`${base}/items`)
      .send(decision)
      .expect(409);
    expect(archived.body.code).toBe('PROJECT_ARCHIVED');
    await admin.get(`${base}/items`).expect(200);

    await admin
      .post(`${base}/items`)
      .send({ ...decision, type: 'document' })
      .expect(400);
  });

  it('indexes documents from Loculus and finds their text', async () => {
    const fileId = files.add(
      orgId,
      projectId,
      '# Runbook\n\nRestart the ingestion worker with `make restart-ingest`.',
      { fileName: 'runbook.md' },
    );
    const created = await admin
      .post(`${base}/documents`)
      .send({ fileId, tags: ['ops'] })
      .expect(201);
    expect(created.body).toMatchObject({
      type: 'document',
      title: 'runbook.md',
      status: 'accepted',
      body: '',
      document: {
        fileId,
        fileName: 'runbook.md',
        contentType: 'text/markdown',
        indexing: { status: 'pending', chunkCount: 0 },
      },
    });
    const id = created.body.id;
    expect(await search(admin, { query: 'ingestion' })).toEqual([]);

    expect(await indexDocuments()).toBe(1);
    const indexed = await admin.get(`${base}/items/${id}`).expect(200);
    expect(indexed.body.document.indexing).toMatchObject({
      status: 'indexed',
      chunkCount: 1,
      error: null,
    });
    const results = await search(admin, {
      query: 'restart ingestion',
      types: ['document'],
    });
    expect(results.map((r) => r.item.id)).toEqual([id]);
    expect(results[0].passage).toContain('make restart-ingest');
    expect(
      await search(admin, { query: 'ingestion', types: ['fact'] }),
    ).toEqual([]);

    // Its text, a passage at a time (agents' read_knowledge), for readers.
    const viewer = await asMember(app, orgId, ['member'], {
      projectRoles: { [projectId]: 'viewer' },
    });
    const passages = await viewer
      .get(`${base}/items/${id}/passages?limit=1`)
      .expect(200);
    expect(passages.body).toEqual({
      items: [
        {
          ordinal: 0,
          version: 1,
          text: expect.stringContaining('make restart-ingest'),
        },
      ],
      nextCursor: null,
    });
    await admin
      .get(
        `/v1/organizations/${orgId}/projects/${polis.project(orgId)}/knowledge/items/${id}/passages`,
      )
      .expect(404);

    // A new file is a new version, indexed again.
    const next = files.add(orgId, projectId, 'Use the dashboard to restart.', {
      fileName: 'runbook-v2.txt',
      contentType: 'text/plain',
    });
    const updated = await admin
      .put(`${base}/documents/${id}`)
      .send({ fileId: next })
      .expect(200);
    expect(updated.body).toMatchObject({
      version: 2,
      title: 'runbook.md',
      document: { fileId: next, indexing: { status: 'pending' } },
    });
    await indexDocuments();
    expect(await search(admin, { query: 'ingestion' })).toEqual([]);
    expect((await search(admin, { query: 'dashboard' })).length).toBe(1);

    const indexedEvents = (await outboxEvents(app)).filter(
      (e) => e.eventType === 'knowledge-item.indexed',
    );
    expect(indexedEvents.map((e) => e.payload)).toEqual([
      { itemId: id, projectId, version: 1, chunkCount: 1 },
      { itemId: id, projectId, version: 2, chunkCount: 1 },
    ]);
  });

  it('refuses files it cannot use and keeps unsupported ones unsearchable but listed', async () => {
    const pending = files.add(orgId, projectId, 'x', { status: 'pending' });
    const otherProject = files.add(orgId, polis.project(orgId), 'x');
    for (const fileId of [pending, otherProject, MISSING_ID]) {
      const res = await admin
        .post(`${base}/documents`)
        .send({ fileId })
        .expect(409);
      expect(res.body.code).toBe('KNOWLEDGE_DOCUMENT_INVALID');
    }

    const written = await admin
      .post(`${base}/items`)
      .send(decision)
      .expect(201);
    await admin
      .put(`${base}/documents/${written.body.id}`)
      .send({ fileId: files.add(orgId, projectId, 'x') })
      .expect(409);

    const pdf = files.add(orgId, projectId, new Uint8Array([37, 80, 68, 70]), {
      fileName: 'Architecture overview.pdf',
      contentType: 'application/pdf',
    });
    const doc = await admin
      .post(`${base}/documents`)
      .send({ fileId: pdf })
      .expect(201);
    await indexDocuments();
    const item = await admin.get(`${base}/items/${doc.body.id}`).expect(200);
    expect(item.body.document.indexing).toMatchObject({
      status: 'unsupported',
    });
    // Only its title is searchable.
    expect(
      (await search(admin, { query: 'architecture overview' })).map(
        (r) => r.item.id,
      ),
    ).toEqual([doc.body.id]);
  });

  it('retries a document while Loculus is unavailable and gives up on a broken one', async () => {
    const fileId = files.add(orgId, projectId, 'Some notes.');
    const doc = await admin
      .post(`${base}/documents`)
      .send({ fileId })
      .expect(201);

    files.failure = new DocumentFileError('Loculus unavailable', true);
    await indexDocuments();
    let item = await admin.get(`${base}/items/${doc.body.id}`).expect(200);
    expect(item.body.document.indexing).toMatchObject({
      status: 'pending',
      error: 'Loculus unavailable',
    });
    // Backed off: nothing to do right now.
    expect(await indexDocuments()).toBe(0);

    files.failure = new DocumentFileError('checksum mismatch', false);
    const broken = await admin
      .post(`${base}/documents`)
      .send({ fileId: files.add(orgId, projectId, 'More notes.') })
      .expect(201);
    await indexDocuments();
    item = await admin.get(`${base}/items/${broken.body.id}`).expect(200);
    expect(item.body.document.indexing).toMatchObject({
      status: 'failed',
      error: 'checksum mismatch',
    });
  });

  it('keeps secrets out of what it stores but keeps email addresses', async () => {
    const created = await admin
      .post(`${base}/items`)
      .send({
        type: 'fact',
        title: 'Contacts',
        body: 'Ask ops@example.com. Token ghp_abcdefghijklmnopqrstuvwxyz0123456789.',
      })
      .expect(201);
    expect(created.body.body).toContain('ops@example.com');
    expect(created.body.body).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz');
  });
});
