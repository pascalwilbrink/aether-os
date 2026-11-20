import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { createApp, MISSING_ID } from './app.js';
import { asMember, type Client } from './auth.js';
import type { FakePylon } from './fake-models.js';
import { projectArchived, type FakePolis } from './fake-polis.js';
import { archiveAgent, createAgent, publishedAgent } from './agora.js';

const SERVICE_ACCOUNT = '0193a1b2-c3d4-7e5f-8a9b-0000000000aa';
const versionBody = {
  instructions: 'Be helpful.',
  model: { provider: 'anthropic', model: 'claude', temperature: 0.2 },
  capabilities: ['chat'],
  tools: [],
  skills: [],
  runtime: {
    provider: 'local',
    executionMode: 'standard' as const,
    sandboxRequired: false,
  },
};

describe('Tasks (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let pylon: FakePylon;
  let orgId: string;
  let projectId: string;
  let owner: Client;
  let agentId: string;
  let versionId: string;
  let base: string;
  let key = 0;

  beforeEach(async () => {
    ({ app, polis, pylon } = await createApp());
    orgId = polis.organization();
    projectId = polis.project(orgId);
    owner = await asMember(app, orgId, ['owner']);
    base = `/v1/organizations/${orgId}/projects/${projectId}/tasks`;

    const published = await publishedAgent(app, orgId, versionBody);
    agentId = published.agentId;
    versionId = published.versionId;
  });

  afterEach(async () => {
    await app.close();
  });

  const body = (extra: Record<string, unknown> = {}) => ({
    title: 'Fix the login bug',
    instructions: "Users can't sign in with uppercase emails.",
    agentId,
    serviceAccountId: SERVICE_ACCOUNT,
    ...extra,
  });

  const create = (
    client: Client,
    extra: Record<string, unknown> = {},
    idempotencyKey = `key-${++key}`,
  ) =>
    client.post(base).set('idempotency-key', idempotencyKey).send(body(extra));

  it("sets a tree's budget in Pylon with the caller's own token", async () => {
    const created = await create(owner, { budgetUsd: '2' }).expect(201);
    const tree = pylon.treeBudgets.get(created.body.id);
    // The request's own token (a JWT), not Hephaestus's.
    expect(tree).toEqual({
      limitUsd: '2',
      token: expect.stringMatching(/^eyJ/),
    });

    // Read and raised through any task of the tree.
    const subtask = await create(owner, { parentTaskId: created.body.id });
    await owner
      .get(`${base}/${subtask.body.id}/budget`)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          scope: 'task_tree',
          scopeId: created.body.id,
          limitUsd: '2.000000',
        }),
      );
    await owner
      .put(`${base}/${subtask.body.id}/budget`)
      .send({ limitUsd: '5' })
      .expect(200);
    expect(pylon.treeBudgets.get(created.body.id)?.limitUsd).toBe('5');

    // Only on a top-level task.
    const refused = await create(owner, {
      parentTaskId: created.body.id,
      budgetUsd: '1',
    }).expect(409);
    expect(refused.body.code).toBe('TASK_BUDGET_INVALID');
  });

  it('creates a task with the agent version pinned, once per idempotency key', async () => {
    const first = await create(owner, {}, 'issue-42').expect(201);
    expect(first.body).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7/),
      organizationId: orgId,
      projectId,
      parentTaskId: null,
      topLevelTaskId: first.body.id,
      title: 'Fix the login bug',
      instructions: expect.any(String),
      agentId,
      agentVersionId: versionId,
      serviceAccountId: SERVICE_ACCOUNT,
      requestedBy: 'user-1',
      status: 'queued',
      failureReason: null,
      pausedFor: null,
      dependsOn: [],
      attempt: 1,
      primaryArtifactId: null,
      review: { artifactKinds: [] },
      reviewRound: 0,
      acceptanceCriteria: [],
      taskTemplateId: null,
      taskTemplateVersion: null,
      repository: null,
      concurrency: null,
      inputFiles: [],
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      finishedAt: null,
      version: 1,
    });

    // The same key: the same task, not a second one.
    const again = await create(
      owner,
      { title: 'Something else' },
      'issue-42',
    ).expect(200);
    expect(again.body.id).toBe(first.body.id);
    const list = await owner.get(base).expect(200);
    expect(list.body.items).toHaveLength(1);

    await owner.get(`${base}/${first.body.id}`).expect(200);
    await owner.get(`${base}/${MISSING_ID}`).expect(404);
  });

  it('keeps the files a task starts from, each once', async () => {
    const fileId = '0195f2a0-0000-7000-8000-0000000000f1';
    const created = await create(
      owner,
      { inputFiles: [{ fileId }, { fileId }] },
      'with-files',
    ).expect(201);
    expect(created.body.inputFiles).toEqual([{ fileId }]);
    expect(
      (await owner.get(`${base}/${created.body.id}`).expect(200)).body
        .inputFiles,
    ).toEqual([{ fileId }]);
    await create(
      owner,
      { inputFiles: Array.from({ length: 21 }, () => ({ fileId })) },
      'too-many-files',
    ).expect(400);
  });

  it('needs an idempotency key, a published agent and an active project', async () => {
    const missing = await owner.post(base).send(body()).expect(400);
    expect(missing.body.errors).toEqual([
      expect.objectContaining({
        parameter: 'Idempotency-Key',
        code: 'REQUIRED',
      }),
    ]);

    const draftOnly = await createAgent(app, orgId, { name: 'Draft' });
    const unpublished = await create(owner, { agentId: draftOnly }).expect(409);
    expect(unpublished.body.code).toBe('AGENT_NOT_PUBLISHED');
    const retired = await publishedAgent(app, orgId);
    await archiveAgent(app, orgId, retired.agentId, 3);
    const archivedAgent = await create(owner, {
      agentId: retired.agentId,
    }).expect(409);
    expect(archivedAgent.body.code).toBe('AGENT_ARCHIVED');
    await create(owner, { agentId: MISSING_ID }).expect(404);

    await projectArchived(app, orgId, projectId, 2);
    const archived = await create(owner).expect(409);
    expect(archived.body.code).toBe('PROJECT_ARCHIVED');
  });

  it('builds task trees: subtasks wait for what they depend on, within their tree', async () => {
    const parent = (await create(owner).expect(201)).body;
    const first = (await create(owner, { parentTaskId: parent.id }).expect(201))
      .body;
    const second = (
      await create(owner, {
        parentTaskId: parent.id,
        dependsOn: [first.id],
      }).expect(201)
    ).body;
    expect(first).toMatchObject({
      parentTaskId: parent.id,
      topLevelTaskId: parent.id,
      status: 'queued',
    });
    expect(second).toMatchObject({ dependsOn: [first.id], status: 'blocked' });

    const subtasks = await owner
      .get(base)
      .query({ parentTaskId: parent.id })
      .expect(200);
    expect(subtasks.body.items).toHaveLength(2);
    expect(subtasks.body.items.map((task: { id: string }) => task.id)).toEqual(
      expect.arrayContaining([first.id, second.id]),
    );
    const blocked = await owner
      .get(base)
      .query({ status: 'blocked' })
      .expect(200);
    expect(blocked.body.items.map((task: { id: string }) => task.id)).toEqual([
      second.id,
    ]);

    // Not across trees, and a top-level task has nothing to depend on.
    const otherTree = (await create(owner).expect(201)).body;
    const across = await create(owner, {
      parentTaskId: otherTree.id,
      dependsOn: [first.id],
    }).expect(409);
    expect(across.body.code).toBe('TASK_DEPENDENCY_INVALID');
    await create(owner, { dependsOn: [first.id] }).expect(409);
    await create(owner, {
      parentTaskId: parent.id,
      dependsOn: [MISSING_ID],
    }).expect(409);
  });

  it('cancels a task and everything under it, idempotently', async () => {
    const parent = (await create(owner).expect(201)).body;
    const child = (await create(owner, { parentTaskId: parent.id }).expect(201))
      .body;
    const grandchild = (
      await create(owner, { parentTaskId: child.id }).expect(201)
    ).body;

    const cancelled = await owner
      .post(`${base}/${parent.id}/cancel`)
      .expect(200);
    expect(cancelled.body).toMatchObject({
      status: 'cancelled',
      finishedAt: expect.any(String),
    });
    for (const id of [child.id, grandchild.id]) {
      expect((await owner.get(`${base}/${id}`).expect(200)).body.status).toBe(
        'cancelled',
      );
    }
    await owner.post(`${base}/${parent.id}/cancel`).expect(200);

    // A finished parent takes no new subtasks, and a cancelled task isn't retried.
    const late = await create(owner, { parentTaskId: parent.id }).expect(409);
    expect(late.body.code).toBe('TASK_PARENT_FINISHED');
    const retry = await owner.post(`${base}/${parent.id}/retry`).expect(409);
    expect(retry.body.code).toBe('TASK_INVALID_TRANSITION');
  });

  it('needs the task permissions in the project', async () => {
    const task = (await create(owner).expect(201)).body;
    await request(app.getHttpServer()).get(base).expect(401);

    // No role in the project: it doesn't exist.
    const outsider = await asMember(app, orgId, ['member']);
    await outsider.get(base).expect(404);

    // Viewers read; editors create and cancel; the requester is recorded.
    const viewer = await asMember(app, orgId, ['member'], {
      [projectId]: 'viewer',
    });
    await viewer.get(`${base}/${task.id}`).expect(200);
    await create(viewer).expect(403);
    await viewer.post(`${base}/${task.id}/cancel`).expect(403);

    const editor = await asMember(
      app,
      orgId,
      ['member'],
      { [projectId]: 'editor' },
      'user-2',
    );
    const mine = await create(editor).expect(201);
    expect(mine.body.requestedBy).toBe('user-2');
    await editor.post(`${base}/${task.id}/cancel`).expect(200);

    // Another project's task is a 404 here.
    const otherProject = polis.project(orgId);
    await owner
      .get(
        `/v1/organizations/${orgId}/projects/${otherProject}/tasks/${task.id}`,
      )
      .expect(404);
  });
});
