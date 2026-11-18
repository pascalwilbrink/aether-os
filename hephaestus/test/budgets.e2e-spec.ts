import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';

import { createApp } from './app.js';
import { asMember, type Client } from './auth.js';
import { type FakePolis } from './fake-polis.js';

const SERVICE_ACCOUNT = '0193a1b2-c3d4-7e5f-8a9b-0000000000aa';
const versionBody = {
  instructions: 'Be helpful.',
  model: { provider: 'anthropic', model: 'claude' },
  capabilities: [],
  tools: [],
  skills: [],
  runtime: {
    provider: 'local',
    executionMode: 'standard',
    sandboxRequired: false,
  },
};

/** The start of this month in UTC, as budgets count it. */
const monthStart = () => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
};

describe('Budgets (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let orgId: string;
  let projectId: string;
  let owner: Client;
  let agentId: string;
  let key = 0;

  beforeEach(async () => {
    ({ app, polis } = await createApp());
    orgId = polis.organization();
    projectId = polis.project(orgId);
    owner = await asMember(app, orgId, ['owner']);
    const agents = `/v1/organizations/${orgId}/agents`;
    agentId = (
      await owner
        .post(agents)
        .send({ name: 'Helper', description: '' })
        .expect(201)
    ).body.id;
    const versionId = (
      await owner
        .post(`${agents}/${agentId}/versions`)
        .send(versionBody)
        .expect(201)
    ).body.id;
    await owner
      .post(`${agents}/${agentId}/versions/${versionId}/publish`)
      .expect(200);
  });

  afterEach(async () => {
    await app.close();
  });

  const tasks = () => `/v1/organizations/${orgId}/projects/${projectId}/tasks`;
  const createTask = (extra: Record<string, unknown> = {}) =>
    owner
      .post(tasks())
      .set('idempotency-key', `key-${++key}`)
      .send({
        title: 'Fix it',
        instructions: 'Please.',
        agentId,
        serviceAccountId: SERVICE_ACCOUNT,
        ...extra,
      });

  it("sets an organization's monthly budget (org:manage)", async () => {
    const path = `/v1/organizations/${orgId}/budget`;
    await expect(owner.get(path).expect(200)).resolves.toMatchObject({
      body: {
        scope: 'organization',
        scopeId: orgId,
        limitUsd: null,
        spentUsd: '0.000000',
        windowStart: monthStart(),
        thresholdPercent: 80,
        updatedAt: null,
      },
    });

    const member = await asMember(app, orgId, ['member']);
    await member.get(path).expect(200);
    await member.put(path).send({ limitUsd: '100' }).expect(403);

    const set = await owner.put(path).send({ limitUsd: '100.5' }).expect(200);
    expect(set.body).toMatchObject({
      limitUsd: '100.500000',
      updatedAt: expect.any(String),
    });
    await owner.put(path).send({ limitUsd: '1.1234567' }).expect(400);
    await owner.put(path).send({ limitUsd: 10 }).expect(400);

    const removed = await owner.put(path).send({ limitUsd: null }).expect(200);
    expect(removed.body.limitUsd).toBeNull();
  });

  it("sets a project's monthly budget (project:manage)", async () => {
    const path = `/v1/organizations/${orgId}/projects/${projectId}/budget`;
    const editor = await asMember(app, orgId, ['member'], {
      [projectId]: 'editor',
    });
    await editor.get(path).expect(200);
    await editor.put(path).send({ limitUsd: '5' }).expect(403);

    const set = await owner.put(path).send({ limitUsd: '5' }).expect(200);
    expect(set.body).toMatchObject({
      scope: 'project',
      scopeId: projectId,
      limitUsd: '5.000000',
      windowStart: monthStart(),
    });
    await expect(owner.get(path)).resolves.toMatchObject({
      body: { limitUsd: '5.000000' },
    });
  });

  it('gives a task tree a budget for its life, through any of its tasks', async () => {
    const top = await createTask({ budgetUsd: '2.5' }).expect(201);
    expect(top.body.pausedFor).toBeNull();
    const sub = await createTask({ parentTaskId: top.body.id }).expect(201);

    // A subtask reads and changes its tree's budget.
    const subBudget = `${tasks()}/${sub.body.id}/budget`;
    await expect(owner.get(subBudget).expect(200)).resolves.toMatchObject({
      body: {
        scope: 'task_tree',
        scopeId: top.body.id,
        limitUsd: '2.500000',
        windowStart: null,
      },
    });
    await owner.put(subBudget).send({ limitUsd: '4' }).expect(200);
    await expect(
      owner.get(`${tasks()}/${top.body.id}/budget`),
    ).resolves.toMatchObject({ body: { limitUsd: '4.000000' } });

    // Only a top-level task takes a budget when it's created.
    const refused = await createTask({
      parentTaskId: top.body.id,
      budgetUsd: '1',
    }).expect(409);
    expect(refused.body.code).toBe('TASK_BUDGET_INVALID');

    const viewer = await asMember(app, orgId, ['member'], {
      [projectId]: 'viewer',
    });
    await viewer.get(subBudget).expect(200);
    await viewer.put(subBudget).send({ limitUsd: '9' }).expect(403);
  });
});
