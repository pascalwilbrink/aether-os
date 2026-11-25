import { readFileSync } from 'node:fs';

import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';

import { DocumentFileError, DocumentIndexer } from '@seshat/knowledge';

import {
  asMember,
  asService,
  asSession,
  asTask,
  createApp,
  SESSION_AGENT_ID,
  SESSION_ID,
  TASK_ID,
  type Client,
} from './app.js';
import type { FakeFiles } from './fake-files.js';
import type { FakePolis } from './fake-polis.js';
import { outboxEvents } from './outbox.js';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url)));

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

  it('lets a platform service read an item, and only read it', async () => {
    const created = await admin
      .post(`${base}/items`)
      .send(decision)
      .expect(201);
    const service = await asService(app);
    const read = await service
      .get(`${base}/items/${created.body.id}`)
      .expect(200);
    expect(read.body).toMatchObject({ title: decision.title, version: 1 });
    await service.post(`${base}/items`).send(decision).expect(403);
    const other = `/v1/organizations/${orgId}/projects/${polis.project(orgId)}/knowledge`;
    await service.get(`${other}/items/${created.body.id}`).expect(404);
  });

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

  it("keeps a session's decision as a proposal, with its rationale, alternatives and session", async () => {
    // A person's token in a session (an agent acting for them) only proposes.
    const session = await asSession(app, orgId, projectId);
    const proposed = await session
      .post(`${base}/items`)
      .send({
        ...decision,
        rationale: 'One engine to run, back up and tune.',
        alternatives: [
          {
            option: 'A separate vector database',
            reason: 'Another system to run.',
          },
        ],
        references: [{ kind: 'round', id: MISSING_ID, title: 'Round 1' }],
      })
      .expect(201);
    expect(proposed.body).toMatchObject({
      status: 'proposed',
      acceptedBy: null,
      rationale: 'One engine to run, back up and tune.',
      alternatives: [
        {
          option: 'A separate vector database',
          reason: 'Another system to run.',
        },
      ],
      source: {
        kind: 'session',
        taskId: null,
        sessionId: SESSION_ID,
        agentId: SESSION_AGENT_ID,
      },
    });
    expect(
      (await outboxEvents(app))
        .filter((event) => event.eventType === 'knowledge-item.proposed')
        .map((event) => (event.payload as { sourceKind: string }).sourceKind),
    ).toEqual(['session']);

    // The session's items, for the session's page.
    await admin.post(`${base}/items`).send(decision).expect(201);
    const listed = await admin
      .get(`${base}/items`)
      .query({ sessionId: SESSION_ID })
      .expect(200);
    expect(listed.body.items.map((item: { id: string }) => item.id)).toEqual([
      proposed.body.id,
    ]);

    // Its reasons are searchable.
    const found = await search(admin, {
      query: 'vector database',
      includeProposed: true,
    });
    expect(found.map((result) => result.item.id)).toContain(proposed.body.id);

    // A session neither edits, accepts nor writes documents.
    await session
      .put(`${base}/items/${proposed.body.id}`)
      .send({ title: 'Changed', body: 'Changed.' })
      .expect(403);
    await session.post(`${base}/items/${proposed.body.id}/accept`).expect(403);
    // A viewer's session can't propose either.
    await (
      await asSession(app, orgId, projectId, 'viewer')
    )
      .post(`${base}/items`)
      .send(decision)
      .expect(403);

    // A person accepts it, reasons and all; and edits the rationale.
    await admin.post(`${base}/items/${proposed.body.id}/accept`).expect(200);
    const edited = await admin
      .put(`${base}/items/${proposed.body.id}`)
      .send({
        title: decision.title,
        body: decision.body,
        rationale: 'Simpler.',
      })
      .expect(200);
    expect(edited.body).toMatchObject({
      rationale: 'Simpler.',
      alternatives: [
        {
          option: 'A separate vector database',
          reason: 'Another system to run.',
        },
      ],
    });
  });

  it('refuses a rationale on anything but a decision', async () => {
    const refused = await admin
      .post(`${base}/items`)
      .send({
        type: 'fact',
        title: 'A fact',
        body: 'It is so.',
        rationale: 'Because.',
      })
      .expect(409);
    expect(refused.body.code).toBe('KNOWLEDGE_ITEM_INVALID');
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

    const image = files.add(
      orgId,
      projectId,
      new Uint8Array([137, 80, 78, 71]),
      {
        fileName: 'Architecture overview.png',
        contentType: 'image/png',
      },
    );
    const doc = await admin
      .post(`${base}/documents`)
      .send({ fileId: image })
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

  it('reads the text of PDFs and Word documents, and fails a PDF it cannot read', async () => {
    const upload = async (name: string, contentType: string) => {
      const fileId = files.add(orgId, projectId, fixture(name), {
        fileName: name,
        contentType,
      });
      const res = await admin
        .post(`${base}/documents`)
        .send({ fileId })
        .expect(201);
      return res.body.id as string;
    };
    const pdf = await upload('two-pages.pdf', 'application/pdf');
    const docx = await upload(
      'checklist.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    const broken = await upload('broken.pdf', 'application/pdf');
    await indexDocuments();

    for (const id of [pdf, docx]) {
      const item = await admin.get(`${base}/items/${id}`).expect(200);
      expect(item.body.document.indexing).toMatchObject({ status: 'indexed' });
    }
    const passages = await admin
      .get(`${base}/items/${pdf}/passages`)
      .expect(200);
    expect(
      passages.body.items.map((p: { text: string }) => p.text).join('\n'),
    ).toContain('Refunds go through the payments team.');
    expect(
      (await search(admin, { query: 'refunds payments' })).map(
        (r) => r.item.id,
      ),
    ).toEqual([pdf]);
    expect(
      (await search(admin, { query: 'migrations release' })).map(
        (r) => r.item.id,
      ),
    ).toEqual([docx]);

    const failed = await admin.get(`${base}/items/${broken}`).expect(200);
    expect(failed.body.document.indexing).toMatchObject({ status: 'failed' });
    expect(failed.body.document.indexing.error).toMatch(/PDF can't be read/);
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
