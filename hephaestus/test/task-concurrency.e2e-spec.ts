import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';

import {
  AgentRuntime,
  RUNNER_OPTIONS,
  SandboxProvisioner,
  TaskRunner,
  TaskTokens,
} from '@hephaestus/runner';

import { createApp } from './app.js';
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
  model: { provider: 'anthropic', model: 'claude' },
  capabilities: [],
  tools: [],
  skills: [],
  runtime: {
    provider: 'local',
    executionMode: 'standard' as const,
    sandboxRequired: false,
  },
};

describe('Concurrency keys (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let runtime: FakeAgentRuntime;
  let orgId: string;
  let projectId: string;
  let owner: Client;
  let agentId: string;
  let tasks: string;
  let key = 0;

  beforeEach(async () => {
    runtime = new FakeAgentRuntime();
    ({ app, polis } = await createApp((builder) =>
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
    tasks = `/v1/organizations/${orgId}/projects/${projectId}/tasks`;
    const published = await publishedAgent(app, orgId, versionBody);
    agentId = published.agentId;
  });

  afterEach(async () => {
    await app.close();
  });

  const create = (extra: Record<string, unknown> = {}) =>
    owner
      .post(tasks)
      .set('idempotency-key', `key-${++key}`)
      .send({
        title: 'Fix issue #12',
        instructions: 'Please.',
        agentId,
        serviceAccountId: SERVICE_ACCOUNT,
        ...extra,
      });

  const concurrency = (policy: string, issue = 'acme/api#12') => ({
    concurrency: { key: issue, policy },
  });

  const status = async (taskId: string) =>
    (await owner.get(`${tasks}/${taskId}`).expect(200)).body.status as string;

  const round = async () => {
    const runner = app.get(TaskRunner);
    await runner.tick();
    await runner.drain();
  };

  it('skips a task while one with its key is unfinished', async () => {
    const first = (await create(concurrency('skip')).expect(201)).body;
    expect(first.concurrency).toEqual({ key: 'acme/api#12', policy: 'skip' });

    const skipped = await create(concurrency('skip')).expect(409);
    expect(skipped.body).toMatchObject({
      code: 'TASK_CONCURRENCY_SKIPPED',
      detail: expect.stringContaining(first.id),
    });
    // Another key, or none, isn't affected.
    await create(concurrency('skip', 'acme/api#13')).expect(201);
    await create().expect(201);

    await owner.post(`${tasks}/${first.id}/cancel`).expect(200);
    await create(concurrency('skip')).expect(201);
  });

  it('cancels the earlier tasks with its key (cancel-previous)', async () => {
    const first = (await create(concurrency('cancel-previous')).expect(201))
      .body;
    const second = (await create(concurrency('cancel-previous')).expect(201))
      .body;

    expect(await status(first.id)).toBe('cancelled');
    expect(await status(second.id)).toBe('queued');
  });

  it("doesn't start a queued task before the earlier ones with its key", async () => {
    const first = (await create(concurrency('queue')).expect(201)).body;
    const second = (await create(concurrency('queue')).expect(201)).body;
    const other = (
      await create(concurrency('queue', 'acme/api#13')).expect(201)
    ).body;

    // The runs wait until the round has claimed what it can: a run that
    // finished first would rightly free its key within the same round.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    runtime.behaviour = async () => {
      await held;
      return { outcome: 'completed', summary: 'Done.' };
    };
    const runner = app.get(TaskRunner);
    await runner.tick();
    expect(await status(first.id)).not.toBe('queued');
    expect(await status(other.id)).not.toBe('queued');
    expect(await status(second.id)).toBe('queued');
    release();
    await runner.drain();
    expect(await status(first.id)).toBe('succeeded');
    expect(await status(other.id)).toBe('succeeded');
    expect(await status(second.id)).toBe('queued');
    expect(runtime.runs.map((run) => run.task.id)).toEqual(
      expect.arrayContaining([first.id, other.id]),
    );
    expect(runtime.runs).toHaveLength(2);

    await round();
    expect(await status(second.id)).toBe('succeeded');
  });

  it('keeps keys on top-level tasks', async () => {
    const parent = (await create().expect(201)).body;
    const refused = await create({
      parentTaskId: parent.id,
      ...concurrency('queue'),
    }).expect(409);
    expect(refused.body.code).toBe('TASK_CONCURRENCY_INVALID');
    await create({ concurrency: { key: '', policy: 'queue' } }).expect(400);
    await create({ concurrency: { key: 'k', policy: 'later' } }).expect(400);
  });
});
