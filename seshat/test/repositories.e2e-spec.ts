import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';

import {
  EventInbox,
  type DomainEvent,
  type ProxenosEvents,
} from '@seshat/core';
import {
  DocumentIndexer,
  KnowledgeRepositoriesService,
  RepositoryFilesError,
  RepositorySyncer,
} from '@seshat/knowledge';

import { asMember, asTask, createApp, type Client } from './app.js';
import type { FakePolis } from './fake-polis.js';
import type { FakeRepositories } from './fake-repositories.js';
import { outboxEvents } from './outbox.js';

interface Item {
  id: string;
  title: string;
  status: string;
  version: number;
  source: {
    kind: string;
    repository: { linkId: string; path: string; commit: string } | null;
  };
  document: {
    fileId: string | null;
    fileName: string;
    contentType: string;
    repository: { path: string; blobSha: string; url: string } | null;
    indexing: { status: string };
  } | null;
}

describe('Repository documents (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let repositories: FakeRepositories;
  let orgId: string;
  let projectId: string;
  let base: string;
  let admin: Client;
  let linkId: string;

  beforeEach(async () => {
    ({ app, polis, repositories } = await createApp());
    orgId = polis.organization();
    projectId = polis.project(orgId);
    base = `/v1/organizations/${orgId}/projects/${projectId}/knowledge`;
    admin = await asMember(app, orgId, ['admin'], { sub: 'admin-1' });
    linkId = uuidv7();
  });

  afterEach(async () => {
    await app.close();
  });

  const link = () => ({ linkId, organizationId: orgId, projectId });

  /** One of Proxenos's events, as the inbox hands it over. */
  function event<T>(eventType: string, payload: T): DomainEvent<T> {
    return {
      eventId: uuidv7(),
      eventType,
      schemaVersion: 1,
      aggregateId: uuidv7(),
      aggregateVersion: 1,
      occurredAt: new Date(),
      organizationId: orgId,
      projectId: null,
      actor: null,
      payload,
    };
  }
  const deliver = (e: DomainEvent) =>
    app.get(EventInbox).receive('proxenos', e);
  const linked = () =>
    deliver(
      event<ProxenosEvents.GitRepositoryLinked>('git.repository-linked', {
        linkId,
        projectId,
        repositoryId: uuidv7(),
        fullName: 'acme/api',
      }),
    );
  const pushed = (after: string) =>
    deliver(
      event<ProxenosEvents.GitPushed>('git.pushed', {
        webhookDeliveryId: uuidv7(),
        deliveryId: 'delivery-1',
        repositoryId: uuidv7(),
        repository: 'acme/api',
        projectIds: [projectId],
        links: [{ projectId, linkId }],
        branch: 'main',
        before: '0'.repeat(40),
        after,
        fromAetherOs: false,
      }),
    );
  const sync = () => app.get(RepositorySyncer).drain();
  const index = () => app.get(DocumentIndexer).drain();
  const repository = async () =>
    (await admin.get(`${base}/repositories/${linkId}`).expect(200)).body;
  const documents = async (status?: string) =>
    (
      (
        await admin
          .get(`${base}/items`)
          .query({ type: 'document', ...(status ? { status } : {}) })
          .expect(200)
      ).body.items as Item[]
    ).sort((a, b) => (a.title < b.title ? -1 : 1));

  it('indexes the default paths of a linked repository, read-only', async () => {
    const commit = repositories.set(link(), {
      'README.md': '# Acme API\n\nThe API speaks JSON over HTTPS.',
      'docs/billing.md':
        '# Billing\n\nInvoices are sent on the first day of the month.',
      'docs/diagram.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      'src/index.ts': 'export {};',
    });
    await linked();
    await linked(); // Redelivered: once.

    expect(await repository()).toMatchObject({
      linkId,
      projectId,
      fullName: 'acme/api',
      paths: ['docs/', 'specs/', 'adr/', 'README.md'],
      status: 'pending',
      commit: null,
    });
    expect(await sync()).toBe(1);
    expect(repositories.listings).toEqual([
      { linkId, paths: ['docs/', 'specs/', 'adr/', 'README.md'] },
    ]);
    expect(await repository()).toMatchObject({
      status: 'synced',
      commit,
      documentCount: 2,
      // The image under docs/: not a type Seshat reads.
      skippedCount: 1,
      error: null,
      syncedAt: expect.any(String),
    });

    const [readme, billing] = await documents();
    expect(billing).toMatchObject({
      title: 'docs/billing.md',
      status: 'accepted',
      version: 1,
      source: {
        kind: 'repository',
        repository: { linkId, path: 'docs/billing.md', commit },
      },
      document: {
        fileId: null,
        fileName: 'billing.md',
        contentType: 'text/markdown',
        repository: {
          path: 'docs/billing.md',
          url: `https://github.com/acme/api/blob/${commit}/docs/billing.md`,
        },
        indexing: { status: 'pending' },
      },
    });
    expect(readme.title).toBe('README.md');

    // Indexed like any document: read through Proxenos, then searchable.
    expect(await index()).toBe(2);
    const { body } = await admin
      .post(`${base}/search`)
      .send({ query: 'invoices' })
      .expect(200);
    expect(body.results.map((r: { item: Item }) => r.item.id)).toEqual([
      billing.id,
    ]);

    // Read-only: the repository is its source of truth.
    for (const [method, path, send] of [
      ['put', `items/${billing.id}`, { title: 'x', body: 'y' }],
      ['post', `items/${billing.id}/retire`, undefined],
      ['post', `items/${billing.id}/reject`, undefined],
      ['put', `documents/${billing.id}`, { fileId: uuidv7() }],
    ] as const) {
      const res = await admin[method](`${base}/${path}`).send(send).expect(409);
      expect(res.body.code).toBe('KNOWLEDGE_ITEM_READ_ONLY');
    }
    const superseding = await admin
      .post(`${base}/items`)
      .send({
        type: 'fact',
        title: 'Billing',
        body: 'Invoices go out on the 2nd.',
        supersedes: billing.id,
      })
      .expect(409);
    expect(superseding.body.code).toBe('KNOWLEDGE_ITEM_READ_ONLY');

    const events = (await outboxEvents(app)).filter(
      (e) => e.aggregateId === billing.id,
    );
    expect(events.map((e) => e.eventType)).toEqual([
      'knowledge-item.accepted',
      'knowledge-item.indexed',
    ]);
    expect(events[0].payload).toMatchObject({ sourceKind: 'repository' });
  });

  it('follows pushes: changed files are new versions, removed ones retired', async () => {
    repositories.set(link(), {
      'README.md': 'Version one.',
      'docs/a.md': 'Alpha.',
      'docs/b.md': 'Beta.',
    });
    await linked();
    await sync();
    await index();
    const reads = repositories.reads.length;
    const before = await documents();

    const commit = repositories.set(link(), {
      'README.md': 'Version one.',
      'docs/a.md': 'Alpha, changed.',
      'docs/c.md': 'Gamma.',
    });
    await pushed(commit);
    expect((await repository()).status).toBe('pending');
    await sync();
    expect(await repository()).toMatchObject({
      status: 'synced',
      commit,
      documentCount: 3,
    });
    // Only the changed and the new file are read again.
    expect(await index()).toBe(2);
    expect(repositories.reads.length - reads).toBe(2);

    const after = await documents();
    const byTitle = (items: Item[], title: string) =>
      items.find((item) => item.title === title)!;
    expect(byTitle(after, 'README.md')).toMatchObject({
      id: byTitle(before, 'README.md').id,
      version: 1,
    });
    expect(byTitle(after, 'docs/a.md')).toMatchObject({
      id: byTitle(before, 'docs/a.md').id,
      version: 2,
      source: { repository: { commit } },
      document: { indexing: { status: 'indexed' } },
    });
    expect(byTitle(after, 'docs/b.md')).toMatchObject({ status: 'retired' });
    expect(byTitle(after, 'docs/c.md')).toMatchObject({
      status: 'accepted',
      version: 1,
    });
    const versions = await admin
      .get(`${base}/items/${byTitle(after, 'docs/a.md').id}/versions`)
      .expect(200);
    expect(
      versions.body.items.map(
        (v: {
          version: number;
          document: { repository: { commit: string } };
        }) => [v.version, v.document.repository.commit === commit],
      ),
    ).toEqual([
      [2, true],
      [1, false],
    ]);

    // A push of what was read already changes nothing.
    await pushed(commit);
    expect((await repository()).status).toBe('synced');

    // A file added back after it was removed is a new document.
    repositories.set(link(), {
      'README.md': 'Version one.',
      'docs/a.md': 'Alpha, changed.',
      'docs/b.md': 'Beta.',
      'docs/c.md': 'Gamma.',
    });
    await app.get(KnowledgeRepositoriesService).sync(orgId, projectId, linkId);
    await sync();
    const betas = (await documents()).filter((i) => i.title === 'docs/b.md');
    expect(betas.map((i) => i.status).sort()).toEqual(['accepted', 'retired']);
  });

  it('lets approvers choose the paths, read again and stop indexing', async () => {
    repositories.set(link(), {
      'README.md': 'Read me.',
      'handbook/onboarding.md': 'Welcome.',
      'docs/a.md': 'Alpha.',
    });
    const path = `${base}/repositories/${linkId}`;

    // A link from before Seshat followed links: added with PUT.
    await admin.get(path).expect(404);
    const editor = await asMember(app, orgId, ['member'], {
      projectRoles: { [projectId]: 'editor' },
    });
    await editor
      .put(path)
      .send({ paths: ['handbook/'] })
      .expect(403);
    await (
      await asTask(app, orgId, projectId)
    )
      .put(path)
      .send({ paths: ['handbook/'] })
      .expect(403);
    await admin
      .put(path)
      .send({ paths: ['../etc/'] })
      .expect(400);
    await admin.put(path).send({ paths: [] }).expect(400);
    const { body: put } = await admin
      .put(path)
      .send({ paths: ['handbook/', 'README.md'] })
      .expect(200);
    expect(put).toMatchObject({
      linkId,
      fullName: null,
      paths: ['handbook/', 'README.md'],
      status: 'pending',
    });
    await sync();
    expect((await documents()).map((i) => i.title)).toEqual([
      'README.md',
      'handbook/onboarding.md',
    ]);

    // Editors read; listing is the project's.
    const { body: page } = await editor.get(`${base}/repositories`).expect(200);
    expect(page.items.map((r: { linkId: string }) => r.linkId)).toEqual([
      linkId,
    ]);
    const other = polis.project(orgId);
    await admin
      .get(
        `/v1/organizations/${orgId}/projects/${other}/knowledge/repositories/${linkId}`,
      )
      .expect(404);
    await admin
      .put(
        `/v1/organizations/${orgId}/projects/${other}/knowledge/repositories/${linkId}`,
      )
      .send({ paths: ['docs/'] })
      .expect(404);

    // Narrower paths retire what's outside them.
    await admin
      .put(path)
      .send({ paths: ['README.md'] })
      .expect(200);
    await sync();
    expect((await documents()).map((i) => [i.title, i.status])).toEqual([
      ['README.md', 'accepted'],
      ['handbook/onboarding.md', 'retired'],
    ]);

    // Read again on request; then stop: its documents are retired.
    const { body: again } = await admin.post(`${path}/sync`).expect(200);
    expect(again.status).toBe('pending');
    await sync();
    await admin.delete(path).expect(204);
    await admin.get(path).expect(404);
    expect((await documents('accepted')).length).toBe(0);
  });

  it('retires the documents of an unlinked repository', async () => {
    repositories.set(link(), { 'README.md': 'Read me.' });
    await linked();
    await sync();
    await deliver(
      event<ProxenosEvents.GitRepositoryUnlinked>('git.repository-unlinked', {
        linkId,
        projectId,
        repositoryId: uuidv7(),
        fullName: 'acme/api',
        reason: 'unlinked',
      }),
    );
    await admin.get(`${base}/repositories/${linkId}`).expect(404);
    expect((await documents()).map((i) => i.status)).toEqual(['retired']);
  });

  it('retries while Proxenos is unavailable, and fails a link that is gone', async () => {
    await linked();
    repositories.failure = new RepositoryFilesError(
      'Proxenos answered 503',
      true,
    );
    await sync();
    expect(await repository()).toMatchObject({
      status: 'pending',
      error: 'Proxenos answered 503',
    });
    // Backed off: not taken again at once.
    expect(await sync()).toBe(0);

    // The link isn't the project's (any more): failed until asked again.
    repositories.failure = null;
    await app.get(KnowledgeRepositoriesService).sync(orgId, projectId, linkId);
    await sync();
    expect(await repository()).toMatchObject({
      status: 'failed',
      error: expect.stringContaining("isn't linked"),
    });

    // A push while a read is under way leaves it pending.
    repositories.set(link(), { 'README.md': 'Read me.' });
    const service = app.get(KnowledgeRepositoriesService);
    await service.sync(orgId, projectId, linkId);
    const claimed = (await service.claim())!;
    await pushed('f'.repeat(40));
    await service.finish(linkId, claimed.revision, {
      kind: 'read',
      fullName: 'acme/api',
      commit: 'e'.repeat(40),
      files: [],
      skippedCount: 0,
      note: null,
    });
    expect(await repository()).toMatchObject({
      status: 'pending',
      commit: 'e'.repeat(40),
    });
    await sync();
    expect((await repository()).status).toBe('synced');
  });
});
