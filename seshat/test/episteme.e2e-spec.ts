import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';

import {
  EventInbox,
  type DomainEvent,
  type EpistemeEvents,
} from '@seshat/core';
import { EpistemeSourceError, type EpistemePublished } from '@seshat/knowledge';

import { asMember, createApp, type Client } from './app.js';
import type { FakeEpisteme } from './fake-episteme.js';
import type { FakePolis } from './fake-polis.js';
import { outboxEvents } from './outbox.js';

interface Item {
  id: string;
  projectId: string | null;
  departmentId: string | null;
  type: string;
  title: string;
  body: string;
  status: string;
  version: number;
  source: {
    kind: string;
    episteme: {
      resourceId: string;
      versionId: string;
      versionNumber: number;
      knowledgeType: string;
    } | null;
  };
}

describe("Episteme's knowledge (e2e)", () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let episteme: FakeEpisteme;
  let orgId: string;
  let departmentId: string;
  let projectId: string;
  let otherProjectId: string;
  let project: string;
  let otherProject: string;
  let department: string;
  let admin: Client;

  beforeEach(async () => {
    ({ app, polis, episteme } = await createApp());
    orgId = polis.organization();
    departmentId = polis.department(orgId);
    projectId = polis.project(orgId, 'active', departmentId);
    otherProjectId = polis.project(orgId);
    project = `/v1/organizations/${orgId}/projects/${projectId}/knowledge`;
    otherProject = `/v1/organizations/${orgId}/projects/${otherProjectId}/knowledge`;
    department = `/v1/organizations/${orgId}/departments/${departmentId}/knowledge`;
    admin = await asMember(app, orgId, ['admin'], { sub: 'admin-1' });
  });

  afterEach(async () => {
    await app.close();
  });

  /** One of Episteme's events, as the inbox hands it over. */
  function event<T>(
    eventType: string,
    resourceId: string,
    payload: T,
  ): DomainEvent<T> {
    return {
      eventId: uuidv7(),
      eventType,
      schemaVersion: 1,
      aggregateId: resourceId,
      aggregateVersion: 1,
      occurredAt: new Date(),
      organizationId: orgId,
      projectId: null,
      actor: null,
      payload,
    };
  }
  const deliver = (e: DomainEvent) =>
    app.get(EventInbox).receive('episteme', e);
  const snapshot = (published: EpistemePublished) => ({
    id: published.resourceId,
    projectId: published.projectId,
    departmentId: published.departmentId,
    knowledgeType: published.knowledgeType,
    status: 'active' as const,
    tags: published.tags,
    scopes: [],
    stewards: [],
    publishedVersionId: published.versionId,
    latestVersionNumber: published.versionNumber,
  });
  const versionOf = (published: EpistemePublished) => ({
    id: published.versionId,
    number: published.versionNumber,
    state: 'published' as const,
    checksum: '0'.repeat(64),
    basedOnVersionId: null,
  });
  const publishedEvent = (published: EpistemePublished) =>
    deliver(
      event<EpistemeEvents.KnowledgeVersionPublished>(
        'knowledge-version.published',
        published.resourceId,
        {
          resource: snapshot(published),
          version: versionOf(published),
          previousVersionId: null,
        },
      ),
    );
  const items = async (base: string) =>
    (await admin.get(`${base}/items`).expect(200)).body.items as Item[];
  const search = async (base: string, query: string) =>
    (
      (await admin.post(`${base}/search`).send({ query }).expect(200)).body
        .results as { item: Item; passage: string }[]
    ).map((r) => r.item);
  const answers = async (resourceId: string) =>
    (await outboxEvents(app)).filter(
      (e) =>
        e.eventType.startsWith('knowledge-indexing.') &&
        e.aggregateId === resourceId,
    );

  it("indexes the organization's published version everywhere in it, read-only, and answers", async () => {
    const v1 = episteme.publish({ organizationId: orgId });
    await publishedEvent(v1);

    // Every project and department sees it, by keywords.
    for (const base of [project, otherProject, department]) {
      const [item] = await items(base);
      expect(item).toMatchObject({
        projectId: null,
        departmentId: null,
        type: 'document',
        title: 'Travel policy',
        status: 'accepted',
        version: 1,
        source: {
          kind: 'episteme',
          episteme: {
            resourceId: v1.resourceId,
            versionId: v1.versionId,
            versionNumber: 1,
            knowledgeType: 'policy',
          },
        },
      });
      expect(item.body).toContain('Book trains');
      expect((await search(base, 'trains')).map((i) => i.id)).toEqual([
        item.id,
      ]);
    }
    const [item] = await items(project);

    // Read-only: changed only by publishing in Episteme.
    const change = await admin
      .put(`${project}/items/${item.id}`)
      .send({ title: 'Mine now', body: 'No.' })
      .expect(409);
    expect(change.body.code).toBe('KNOWLEDGE_ITEM_READ_ONLY');
    await admin.post(`${project}/items/${item.id}/retire`).expect(409);
    await admin.post(`${department}/items/${item.id}/retire`).expect(409);

    // Answered once, for its version; redelivery changes nothing.
    const [answer] = await answers(v1.resourceId);
    expect(answer).toMatchObject({
      eventType: 'knowledge-indexing.completed',
      aggregateVersion: v1.resourceVersion,
      payload: {
        resourceId: v1.resourceId,
        versionId: v1.versionId,
        versionNumber: 1,
        itemId: item.id,
        itemVersion: 1,
      },
    });
    expect(answer.payload).toMatchObject({ chunkCount: 1 });

    // A newer version: a new version of the same item.
    const v2 = episteme.publish({
      organizationId: orgId,
      resourceId: v1.resourceId,
      content: '# Travel\n\nFly only for trips over eight hours.',
    });
    await publishedEvent(v2);
    const [updated] = await items(project);
    expect(updated).toMatchObject({
      id: item.id,
      version: 2,
      source: { episteme: { versionId: v2.versionId, versionNumber: 2 } },
    });
    expect(await search(project, 'trains')).toEqual([]);
    expect((await search(project, 'eight hours')).map((i) => i.id)).toEqual([
      item.id,
    ]);
    expect((await answers(v1.resourceId)).map((e) => e.payload)).toEqual([
      expect.objectContaining({ versionId: v1.versionId }),
      expect.objectContaining({ versionId: v2.versionId, itemVersion: 2 }),
    ]);

    // An older event delivered late reads Episteme as it is now: no change.
    await deliver(
      event<EpistemeEvents.KnowledgeVersionWithdrawn>(
        'knowledge-version.withdrawn',
        v1.resourceId,
        {
          resourceId: v1.resourceId,
          version: { ...versionOf(v1), state: 'superseded' },
          reason: 'superseded',
        },
      ),
    );
    expect((await items(project))[0]).toMatchObject({ version: 2 });

    // Archived: retired, no longer found.
    episteme.archive(v1.resourceId);
    await deliver(
      event<EpistemeEvents.KnowledgeResourceArchived>(
        'knowledge-resource.archived',
        v1.resourceId,
        {
          resource: {
            ...snapshot(v2),
            status: 'archived',
            publishedVersionId: null,
          },
          withdrawnVersionId: v2.versionId,
        },
      ),
    );
    const retired = await admin.get(`${project}/items/${item.id}`).expect(200);
    expect(retired.body.status).toBe('retired');
    expect(await search(project, 'eight hours')).toEqual([]);
  });

  it("keeps a project's resource in the project and a department's in the department", async () => {
    const ofProject = episteme.publish({
      organizationId: orgId,
      projectId,
      title: 'Deploy runbook',
      knowledgeType: 'runbook',
      content: 'Roll back with the previous image tag.',
    });
    const ofDepartment = episteme.publish({
      organizationId: orgId,
      departmentId,
      title: 'Expense procedure',
      knowledgeType: 'procedure',
      content: 'Receipts go in within thirty days.',
    });
    await publishedEvent(ofProject);
    await publishedEvent(ofDepartment);

    const titles = async (base: string) =>
      (await items(base)).map((i) => i.title).sort();
    expect(await titles(project)).toEqual([
      'Deploy runbook',
      'Expense procedure',
    ]);
    expect(await titles(department)).toEqual(['Expense procedure']);
    expect(await titles(otherProject)).toEqual([]);
    expect(await search(otherProject, 'receipts')).toEqual([]);
    expect((await search(project, 'receipts'))[0]).toMatchObject({
      departmentId,
      projectId: null,
    });

    // The project's is embedded (Pylon charges the project); the department's isn't.
    const [projectItem] = (await items(project)).filter(
      (i) => i.title === 'Deploy runbook',
    );
    expect(projectItem.projectId).toBe(projectId);
    const answer = (await answers(ofProject.resourceId))[0];
    expect(answer.projectId).toBe(projectId);

    // Deleted in Episteme: retired.
    episteme.remove(ofProject.resourceId);
    await deliver(
      event<EpistemeEvents.KnowledgeResourceDeleted>(
        'knowledge-resource.deleted',
        ofProject.resourceId,
        { resourceId: ofProject.resourceId },
      ),
    );
    const gone = await admin
      .get(`${project}/items/${projectItem.id}`)
      .expect(200);
    expect(gone.body.status).toBe('retired');
  });

  it('answers failed when Episteme refuses, and leaves the inbox to retry when it doesnt answer', async () => {
    const published = episteme.publish({ organizationId: orgId });

    episteme.failure = new EpistemeSourceError('Episteme answered 403', false);
    await publishedEvent(published);
    expect(await answers(published.resourceId)).toMatchObject([
      {
        eventType: 'knowledge-indexing.failed',
        payload: {
          resourceId: published.resourceId,
          versionId: published.versionId,
          error: 'Episteme answered 403',
        },
      },
    ]);
    expect(await items(project)).toEqual([]);

    episteme.failure = new EpistemeSourceError("Episteme didn't answer", true);
    await expect(publishedEvent(published)).rejects.toThrow(
      "Episteme didn't answer",
    );

    // Episteme back: the retried delivery indexes it.
    episteme.failure = null;
    await publishedEvent(published);
    expect(await items(project)).toHaveLength(1);
    expect(
      (await answers(published.resourceId)).map((e) => e.eventType),
    ).toEqual(['knowledge-indexing.failed', 'knowledge-indexing.completed']);
  });
});
