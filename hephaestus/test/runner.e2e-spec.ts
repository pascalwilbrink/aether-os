import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import {
  AgentRuntime,
  RUNNER_OPTIONS,
  SandboxProvisioner,
  TaskRunner,
  TaskTokens,
} from '@hephaestus/runner';

import { createApp, MISSING_ID } from './app.js';
import type { FakeTaskContextSource } from './fake-knowledge.js';
import { asMember, type Client } from './auth.js';
import type { FakePolis } from './fake-polis.js';
import {
  FakeAgentRuntime,
  FakeSandboxProvisioner,
  FakeTaskTokens,
  testRunnerOptions,
} from './fake-runner.js';
import { publishedAgent } from './agora.js';

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

describe('Running tasks (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let knowledge: FakeTaskContextSource;
  let runtime: FakeAgentRuntime;
  let orgId: string;
  let projectId: string;
  let owner: Client;
  let base: string;

  beforeEach(async () => {
    runtime = new FakeAgentRuntime();
    ({ app, polis, knowledge } = await createApp((builder) =>
      builder
        .overrideProvider(RUNNER_OPTIONS)
        .useValue(testRunnerOptions())
        .overrideProvider(AgentRuntime)
        .useValue(runtime)
        .overrideProvider(TaskTokens)
        .useValue(new FakeTaskTokens())
        .overrideProvider(SandboxProvisioner)
        .useValue(new FakeSandboxProvisioner()),
    ));
    orgId = polis.organization();
    projectId = polis.project(orgId);
    owner = await asMember(app, orgId, ['owner']);
    base = `/v1/organizations/${orgId}/projects/${projectId}/tasks`;
  });

  afterEach(async () => {
    await app.close();
  });

  async function queuedTask(): Promise<string> {
    const published = await publishedAgent(app, orgId, versionBody);
    const agentId = published.agentId;
    return (
      await owner
        .post(base)
        .set('idempotency-key', 'issue-7')
        .send({
          title: 'Fix the login bug',
          instructions: 'Users with uppercase emails cannot sign in.',
          agentId,
          serviceAccountId: SERVICE_ACCOUNT,
        })
        .expect(201)
    ).body.id;
  }

  it('gives the agent the brief as given, with the text from outside apart', async () => {
    const published = await publishedAgent(app, orgId, versionBody);
    const input = {
      name: 'issue.title',
      source: 'GitHub issue #12',
      value: 'Login fails',
    };
    await owner
      .post(base)
      .set('idempotency-key', 'with-untrusted')
      .send({
        title: 'Fix {{issue.title}}',
        description: 'The issue: {{issue.title}}',
        agentId: published.agentId,
        serviceAccountId: SERVICE_ACCOUNT,
        untrustedInputs: [input],
      })
      .expect(201);
    const runner = app.get(TaskRunner);
    await runner.tick();
    await runner.drain();
    // The runtime marks it as data (briefOf); people see it filled in.
    expect(runtime.runs.at(-1)?.task).toMatchObject({
      title: 'Fix {{issue.title}}',
      description: 'The issue: {{issue.title}}',
      untrustedInputs: [input],
    });
  });

  it('gives the agent the knowledge pinned on its task', async () => {
    const itemId = knowledge.add({
      id: '0195f2a0-0000-7000-8000-0000000000d1',
      title: 'Emails are case-insensitive',
      type: 'convention',
      body: 'Compare emails lowercased.',
      version: 2,
    });
    const published = await publishedAgent(app, orgId, versionBody);
    await owner
      .post(base)
      .set('idempotency-key', 'with-knowledge')
      .send({
        title: 'Fix the login bug',
        instructions: 'Users with uppercase emails cannot sign in.',
        agentId: published.agentId,
        serviceAccountId: SERVICE_ACCOUNT,
        context: [{ kind: 'knowledge', itemId }],
      })
      .expect(201);
    // Changed in Seshat since: the run still gets what the task pinned.
    knowledge.add({ id: itemId, title: 'Changed', version: 3 });
    const runner = app.get(TaskRunner);
    await runner.tick();
    await runner.drain();
    expect(runtime.runs.at(-1)?.context).toEqual([
      {
        kind: 'knowledge',
        itemId,
        version: 2,
        type: 'convention',
        title: 'Emails are case-insensitive',
        body: 'Compare emails lowercased.',
        truncated: false,
        fileName: null,
      },
    ]);
  });

  it('runs a task and lists its executions', async () => {
    const taskId = await queuedTask();
    const runner = app.get(TaskRunner);
    await runner.tick();
    await runner.drain();

    await owner
      .get(`${base}/${taskId}`)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('succeeded'));
    const executions = await owner
      .get(`${base}/${taskId}/executions`)
      .expect(200);
    expect(executions.body).toEqual({
      items: [
        {
          id: expect.any(String),
          taskId,
          attempt: 1,
          number: 1,
          status: 'completed',
          failureReason: null,
          error: null,
          summary: 'Done.',
          // The fake runtime calls no model.
          usage: {
            modelCalls: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            costUsd: null,
          },
          repository: null,
          // Its agent version needs no sandbox.
          sandbox: null,
          // Not tracing in tests (no OTLP endpoint).
          traceId: null,
          startedAt: expect.any(String),
          endedAt: expect.any(String),
        },
      ],
      nextCursor: null,
    });
    expect(runtime.runs[0].task).toMatchObject({
      id: taskId,
      title: 'Fix the login bug',
    });
  });

  it('needs task:read in the project to list executions', async () => {
    const taskId = await queuedTask();
    const path = `${base}/${taskId}/executions`;

    await request(app.getHttpServer()).get(path).expect(401);
    await (await asMember(app, orgId, ['member'])).get(path).expect(404);
    await (
      await asMember(app, orgId, ['member'], { [projectId]: 'viewer' })
    )
      .get(path)
      .expect(200);
    await owner.get(`${base}/${MISSING_ID}/executions`).expect(404);
    const otherProject = polis.project(orgId);
    await owner
      .get(
        `/v1/organizations/${orgId}/projects/${otherProject}/tasks/${taskId}/executions`,
      )
      .expect(404);
  });

  it("follows an execution's activity over HTTP, with task:read", async () => {
    const taskId = await queuedTask();
    const runner = app.get(TaskRunner);
    await runner.tick();
    await runner.drain();
    const [execution] = (
      await owner.get(`${base}/${taskId}/executions`).expect(200)
    ).body.items;
    const path = `${base}/${taskId}/executions/${execution.id}/events`;

    const all = await owner.get(path).expect(200);
    expect(all.body.executionStatus).toBe('completed');
    expect(all.body.items[0]).toEqual({
      sequence: 1,
      type: 'log',
      level: 'info',
      message: 'Execution started (attempt 1)',
      toolName: null,
      input: null,
      output: null,
      text: null,
      inputTokens: null,
      outputTokens: null,
      createdAt: expect.any(String),
    });
    expect(all.body.items.at(-1)).toMatchObject({ message: 'Completed' });
    expect(all.body.nextAfter).toBe(all.body.items.length);

    // From a point on, a page at a time.
    const later = await owner.get(`${path}?after=2&limit=1`).expect(200);
    expect(
      later.body.items.map((e: { sequence: number }) => e.sequence),
    ).toEqual([3]);
    expect(later.body.nextAfter).toBe(3);

    // A viewer of the project reads it; nobody else, nor another task's route.
    await (
      await asMember(app, orgId, ['member'], { [projectId]: 'viewer' })
    )
      .get(path)
      .expect(200);
    await (await asMember(app, orgId, ['member'])).get(path).expect(404);
    await owner
      .get(`${base}/${MISSING_ID}/executions/${execution.id}/events`)
      .expect(404);
    await owner
      .get(`${base}/${taskId}/executions/${MISSING_ID}/events`)
      .expect(404);
    await owner.get(`${path}?after=-1`).expect(400);
  });

  it('lists and reads the artifacts a task produced', async () => {
    const taskId = await queuedTask();
    const runner = app.get(TaskRunner);
    await runner.tick();
    await runner.drain();

    const task = await owner.get(`${base}/${taskId}`).expect(200);
    const list = await owner.get(`${base}/${taskId}/artifacts`).expect(200);
    expect(list.body).toEqual({
      items: [
        {
          id: task.body.primaryArtifactId,
          organizationId: orgId,
          projectId,
          taskId,
          executionId: expect.any(String),
          agentVersionId: task.body.agentVersionId,
          kind: 'text',
          status: 'final',
          primary: true,
          revisionOf: null,
          deliverableKey: null,
          title: 'Answer',
          // Made from the agent's final answer.
          metadata: { 'aether-os.final-answer': 'true' },
          review: null,
          format: 'markdown',
          content: 'Done.',
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          version: 2,
        },
        // Verification is part of every run: no criteria, nothing to check.
        expect.objectContaining({
          kind: 'verification',
          title: 'Verification, round 1',
          status: 'final',
          primary: false,
          round: 1,
          results: [],
        }),
      ],
      nextCursor: null,
    });
    await owner
      .get(`${base}/${taskId}/artifacts`)
      .query({ status: 'partial' })
      .expect(200)
      .expect(({ body }) => expect(body.items).toEqual([]));

    const artifactPath = `${base}/${taskId}/artifacts/${task.body.primaryArtifactId}`;
    const one = await owner.get(artifactPath).expect(200);
    expect(one.body).toEqual(list.body.items[0]);

    // Task permissions in the project; another task's or project's is a 404.
    await (
      await asMember(app, orgId, ['member'])
    )
      .get(artifactPath)
      .expect(404);
    await (
      await asMember(app, orgId, ['member'], { [projectId]: 'viewer' })
    )
      .get(artifactPath)
      .expect(200);
    await owner.get(`${base}/${taskId}/artifacts/${MISSING_ID}`).expect(404);
    await owner
      .get(`${base}/${MISSING_ID}/artifacts/${task.body.primaryArtifactId}`)
      .expect(404);
  });

  it('reviews drafts over HTTP, with task:approve in the project', async () => {
    // As queuedTask, but every artifact needs approval.
    const published = await publishedAgent(app, orgId, versionBody);
    const agentId = published.agentId;
    const taskId = (
      await owner
        .post(base)
        .set('idempotency-key', 'reviewed')
        .send({
          title: 'Write it up',
          instructions: 'For review.',
          agentId,
          serviceAccountId: SERVICE_ACCOUNT,
          review: { artifactKinds: ['*'] },
        })
        .expect(201)
    ).body.id;
    const runner = app.get(TaskRunner);
    await runner.tick();
    await runner.drain();

    const task = await owner.get(`${base}/${taskId}`).expect(200);
    expect(task.body).toMatchObject({
      status: 'awaiting_review',
      review: { artifactKinds: ['*'] },
      reviewRound: 1,
    });
    const [draft] = (await owner.get(`${base}/${taskId}/artifacts`).expect(200))
      .body.items;
    const path = `${base}/${taskId}/artifacts/${draft.id}`;

    // Editors can't review; approvers can. Requesting changes needs comments.
    const editor = await asMember(app, orgId, ['member'], {
      [projectId]: 'editor',
    });
    await editor.post(`${path}/approve`).send({}).expect(403);
    const approver = await asMember(
      app,
      orgId,
      ['member'],
      { [projectId]: 'approver' },
      'approver-1',
    );
    await approver
      .post(`${path}/request-changes`)
      .send({ comments: [] })
      .expect(400);

    const approved = await approver
      .post(`${path}/approve`)
      .send({ comment: 'Good.' })
      .expect(200);
    expect(approved.body).toMatchObject({
      status: 'final',
      review: {
        decision: 'approved',
        comments: [{ body: 'Good.' }],
        decidedBy: 'approver-1',
      },
    });
    await owner
      .get(`${base}/${taskId}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          status: 'succeeded',
          primaryArtifactId: draft.id,
        }),
      );
    const again = await approver.post(`${path}/reject`).send({}).expect(409);
    expect(again.body.code).toBe('ARTIFACT_NOT_DRAFT');
  });
});
