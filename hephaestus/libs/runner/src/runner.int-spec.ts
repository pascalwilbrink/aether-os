import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { actingAs, testPrincipal } from '@aether-os/krepis/testing';
import { TasksService } from '@hephaestus/tasks';

import { organizationEvent, type FakePolis } from '../../../test/fake-polis.js';
import {
  FakeAgentRuntime,
  FakeSandboxProvisioner,
  FakeTaskTokens,
  RunnerFailure,
  testRunnerOptions,
  untilAborted,
} from '../../../test/fake-runner.js';
import { createTestingModuleWith } from '../../../test/testing-module.js';
import { AgentRuntime } from './agent-runtime.js';
import { ExecutionReaper } from './execution-reaper.js';
import { ExecutionHistory } from './execution-history.js';
import { ExecutionsService } from './executions.service.js';
import { RunnerModule } from './runner.module.js';
import { RUNNER_OPTIONS, type RunnerOptions } from './runner.options.js';
import { SandboxProvisioner } from './sandbox-provisioner.js';
import { TaskRunner } from './task-runner.js';
import { TaskTokens } from './task-tokens.js';
import { publishedAgent } from '../../../test/agora.js';

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
    sandboxRequired: true,
  },
};

describe('TaskRunner (Postgres)', () => {
  let moduleRef: TestingModule;
  let polis: FakePolis;
  let runtime: FakeAgentRuntime;
  let tokens: FakeTaskTokens;
  let sandboxes: FakeSandboxProvisioner;
  let runner: TaskRunner;
  let executions: ExecutionsService;
  let history: ExecutionHistory;
  let key = 0;

  async function start(options: Partial<RunnerOptions> = {}) {
    runtime = new FakeAgentRuntime();
    tokens = new FakeTaskTokens();
    sandboxes = new FakeSandboxProvisioner();
    ({ moduleRef, polis } = await createTestingModuleWith(
      (builder) =>
        builder
          .overrideProvider(RUNNER_OPTIONS)
          .useValue(testRunnerOptions(options))
          .overrideProvider(AgentRuntime)
          .useValue(runtime)
          .overrideProvider(TaskTokens)
          .useValue(tokens)
          .overrideProvider(SandboxProvisioner)
          .useValue(sandboxes),
      RunnerModule,
    ));
    runner = moduleRef.get(TaskRunner);
    executions = moduleRef.get(ExecutionsService);
    history = moduleRef.get(ExecutionHistory);
  }

  afterEach(async () => {
    await moduleRef.close();
  });

  /** An organization with a project and a published agent. */
  async function tenant() {
    const organizationId = polis.organization();
    const projectId = polis.project(organizationId);
    const caller = testPrincipal({
      sub: 'user-1',
      subType: 'user',
      organizationId,
      organizationRoles: ['owner'],
      scopes: [],
    });
    const published = await publishedAgent(
      moduleRef,
      organizationId,
      versionBody,
    );
    const agentId = published.agentId;
    const version = { id: published.versionId };
    const tasks = actingAs(moduleRef.get(TasksService), caller);

    const create = async (
      extra: {
        parentTaskId?: string;
        dependsOn?: string[];
        projectId?: string;
      } = {},
    ) => {
      const { projectId: project = projectId, ...rest } = extra;
      return (
        await tasks.create(
          organizationId,
          project,
          {
            title: `Task ${++key}`,
            instructions: 'Fix the bug',
            agentId,
            serviceAccountId: SERVICE_ACCOUNT,
            ...rest,
          },
          `key-${key}`,
        )
      ).task;
    };
    const task = (id: string, project = projectId) =>
      tasks.findById(organizationId, project, id);
    const executionsOf = async (id: string, project = projectId) =>
      (await history.list(organizationId, project, id, { limit: 50 })).items;
    return {
      organizationId,
      projectId,
      versionId: version.id,
      tasks,
      create,
      task,
      executionsOf,
    };
  }

  /** Waits until the runtime got `count` runs (executions start async). */
  async function untilRuns(count: number) {
    for (let i = 0; i < 200 && runtime.runs.length < count; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(runtime.runs).toHaveLength(count);
  }

  /** One round, and every execution it started run to its end. */
  async function runOnce() {
    await runner.tick();
    await runner.drain();
  }

  const statusChanges = async (taskId: string) =>
    (
      (await moduleRef
        .get(DataSource)
        .query('SELECT message FROM outbox ORDER BY created_at, id')) as {
        message: {
          eventType: string;
          payload: { taskId: string; to?: string; reason?: string };
        };
      }[]
    )
      .map((row) => row.message)
      .filter(
        (event) =>
          event.payload.taskId === taskId &&
          event.eventType === 'task.status-changed',
      )
      .map((event) => [event.payload.to, event.payload.reason]);

  it('runs a queued task to success, then the tasks that depended on it', async () => {
    await start();
    const t = await tenant();
    const parent = await t.create();
    const first = await t.create({ parentTaskId: parent.id });
    const second = await t.create({
      parentTaskId: parent.id,
      dependsOn: [first.id],
    });

    await runOnce();

    await expect(t.task(first.id)).resolves.toMatchObject({
      status: 'succeeded',
    });
    expect(await statusChanges(first.id)).toEqual([
      ['provisioning', 'provision'],
      ['running', 'sandbox-ready'],
      ['verifying', 'agent-finished'],
      ['delivering', 'verified'],
      ['succeeded', 'nothing-to-deliver'],
    ]);
    const [execution] = await t.executionsOf(first.id);
    expect(execution).toMatchObject({
      taskId: first.id,
      attempt: 1,
      number: 1,
      status: 'completed',
      failureReason: null,
      summary: 'Done.',
      endedAt: expect.any(String),
    });

    // What the runtime got: the pinned version, the sandbox, the task token.
    const run = runtime.runs.find((r) => r.task.id === first.id)!;
    expect(run).toMatchObject({
      executionId: execution.id,
      agentVersion: { id: t.versionId },
      sandbox: { reference: { sandboxId: `sbx-${execution.id}` } },
      token: `task-token-for-${first.id}`,
    });
    expect(tokens.issued).toContainEqual({
      serviceAccountId: SERVICE_ACCOUNT,
      organizationId: t.organizationId,
      projectId: t.projectId,
      taskId: first.id,
      expiresInSeconds: 120,
    });
    expect(sandboxes.destroyed).toContainEqual({
      sandboxId: `sbx-${execution.id}`,
    });

    // The dependent was queued by first's success; it runs in this round or
    // the next.
    await runOnce();
    await expect(t.task(second.id)).resolves.toMatchObject({
      status: 'succeeded',
    });
    await expect(t.task(parent.id)).resolves.toMatchObject({
      status: 'succeeded',
    });
  });

  it('fails the task when the agent gives up', async () => {
    await start();
    const t = await tenant();
    runtime.behaviour = () =>
      Promise.resolve({ outcome: 'failed', error: 'The bug is a feature.' });
    const task = await t.create();

    await runOnce();

    await expect(t.task(task.id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'agent_failed',
    });
    expect(await t.executionsOf(task.id)).toEqual([
      expect.objectContaining({
        status: 'failed',
        failureReason: 'agent_failed',
        error: 'The bug is a feature.',
      }),
    ]);
  });

  it('retries infrastructure failures with backoff, then fails the task', async () => {
    // One execution per round: with no backoff, a quick failure would
    // otherwise be claimed again in the same round.
    await start({ maxExecutions: 1 });
    const t = await tenant();
    runtime.behaviour = () => Promise.reject(new Error('sandbox crashed'));
    const task = await t.create();

    for (const expected of ['queued', 'queued', 'failed']) {
      await runOnce();
      await expect(t.task(task.id)).resolves.toMatchObject({
        status: expected,
      });
    }
    await expect(t.task(task.id)).resolves.toMatchObject({
      failureReason: 'infrastructure',
    });
    const all = await t.executionsOf(task.id);
    expect(all.map((e) => [e.number, e.status, e.failureReason])).toEqual([
      [3, 'failed', 'infrastructure'],
      [2, 'failed', 'infrastructure'],
      [1, 'failed', 'infrastructure'],
    ]);
    expect(await statusChanges(task.id)).toContainEqual([
      'queued',
      'infrastructure-retry',
    ]);

    // A person's retry is a new attempt, with its own failures left.
    runtime.behaviour = () =>
      Promise.resolve({ outcome: 'completed', summary: 'Fine now.' });
    await t.tasks.retry(t.organizationId, t.projectId, task.id);
    await runOnce();
    await expect(t.task(task.id)).resolves.toMatchObject({
      status: 'succeeded',
      attempt: 2,
    });
    expect((await t.executionsOf(task.id))[0]).toMatchObject({
      attempt: 2,
      number: 4,
      status: 'completed',
    });
  });

  it('waits for the backoff before the next execution', async () => {
    await start({ retryBackoffMs: 60_000 });
    const t = await tenant();
    runtime.behaviour = () => Promise.reject(new Error('provider 503'));
    const task = await t.create();

    await runOnce();
    await runOnce();

    await expect(t.task(task.id)).resolves.toMatchObject({ status: 'queued' });
    expect(runtime.runs).toHaveLength(1);
  });

  it('fails without retrying when Pistis refuses the service account', async () => {
    await start();
    const t = await tenant();
    tokens.refuse = new RunnerFailure(
      'no role in the project',
      'access_denied',
    );
    const task = await t.create();

    await runOnce();

    await expect(t.task(task.id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'access_denied',
    });
    expect(runtime.runs).toHaveLength(0);
    expect(await t.executionsOf(task.id)).toHaveLength(1);
  });

  it('stops a running execution when its task is cancelled', async () => {
    await start();
    const t = await tenant();
    runtime.behaviour = ({ signal }) => untilAborted(signal);
    const task = await t.create();

    await runner.tick();
    await untilRuns(1);
    await expect(t.task(task.id)).resolves.toMatchObject({
      status: 'running',
    });
    await t.tasks.cancel(t.organizationId, t.projectId, task.id);
    await runner.heartbeat();
    await runner.drain();

    await expect(t.task(task.id)).resolves.toMatchObject({
      status: 'cancelled',
    });
    const [execution] = await t.executionsOf(task.id);
    expect(execution).toMatchObject({ status: 'cancelled' });
    expect(runtime.runs[0].signal.aborted).toBe(true);
    expect(sandboxes.destroyed).toEqual([{ sandboxId: `sbx-${execution.id}` }]);
  });

  it('fails a run that takes longer than the run timeout', async () => {
    await start({ runTimeoutMs: 50 });
    const t = await tenant();
    runtime.behaviour = ({ signal }) => untilAborted(signal);
    const task = await t.create();

    await runOnce();

    await expect(t.task(task.id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'timeout',
    });
  });

  it('starts tasks within the concurrency limits, fairly across organizations', async () => {
    await start({
      maxExecutions: 10,
      limits: { perOrganization: 2, perProject: 1 },
    });
    runtime.behaviour = ({ signal }) => untilAborted(signal);
    const a = await tenant();
    const otherProject = polis.project(a.organizationId);
    const a1 = await a.create();
    const a2 = await a.create();
    const a3 = await a.create({ projectId: otherProject });
    const a4 = await a.create({ projectId: otherProject });
    const b = await tenant();
    const b1 = await b.create();

    await runner.tick();

    // One per project, two per organization, and B isn't starved by A's
    // older tasks.
    const started = (
      (await moduleRef
        .get(DataSource)
        .query('SELECT task_id FROM executions')) as { task_id: string }[]
    ).map((row) => row.task_id);
    expect(started).toHaveLength(3);
    expect(started).toEqual(expect.arrayContaining([a1.id, a3.id, b1.id]));
    expect(started).not.toContain(a2.id);
    expect(started).not.toContain(a4.id);
    await runner.onApplicationShutdown();
  });

  it('never gives one task to two runners', async () => {
    await start();
    const t = await tenant();
    const one = await t.create();
    const two = await t.create();

    const claims = await Promise.all(
      ['runner-a', 'runner-b', 'runner-c'].map((id) => executions.claim(id)),
    );

    const claimed = claims.filter((claim) => claim !== null);
    expect(claimed.map((claim) => claim.task.id).sort()).toEqual(
      [one.id, two.id].sort(),
    );
    expect(claims.filter((claim) => claim === null)).toHaveLength(1);
  });

  it("doesn't start tasks in a suspended organization", async () => {
    await start();
    const t = await tenant();
    const task = await t.create();
    await organizationEvent(
      moduleRef,
      t.organizationId,
      'organization.suspended',
      2,
    );

    await runOnce();
    await expect(t.task(task.id)).resolves.toMatchObject({ status: 'queued' });

    await organizationEvent(
      moduleRef,
      t.organizationId,
      'organization.reactivated',
      3,
    );
    await runOnce();
    await expect(t.task(task.id)).resolves.toMatchObject({
      status: 'succeeded',
    });
  });

  it('requeues the task of an execution whose runner went quiet', async () => {
    await start();
    const t = await tenant();
    runtime.behaviour = ({ signal }) => untilAborted(signal);
    const task = await t.create();
    await runner.tick();
    await untilRuns(1);

    // Its runner stopped sending heartbeats (as if it had died).
    await moduleRef
      .get(DataSource)
      .query(`UPDATE executions SET heartbeat_at = now() - interval '1 hour'`);
    // Any instance's reaper (not a whole round: it would start it again).
    await moduleRef.get(ExecutionReaper).reap();
    await expect(t.task(task.id)).resolves.toMatchObject({ status: 'queued' });
    const [execution] = await t.executionsOf(task.id);
    expect(execution).toMatchObject({
      status: 'failed',
      failureReason: 'infrastructure',
      error: 'No heartbeat from its runner for 120 seconds',
    });
    expect(sandboxes.destroyed).toEqual([{ sandboxId: `sbx-${execution.id}` }]);

    // The old runner finds out at its next heartbeat and stops.
    runtime.behaviour = () =>
      Promise.resolve({ outcome: 'completed', summary: 'Done.' });
    await runner.heartbeat();
    await runner.drain();
    expect(runtime.runs[0].signal.aborted).toBe(true);
    await runOnce();
    await expect(t.task(task.id)).resolves.toMatchObject({
      status: 'succeeded',
    });
  });

  it('interrupts its executions on shutdown, and the tasks run again', async () => {
    await start();
    const t = await tenant();
    runtime.behaviour = ({ signal }) => untilAborted(signal);
    const task = await t.create();
    await runner.tick();
    await untilRuns(1);

    await runner.onApplicationShutdown();

    await expect(t.task(task.id)).resolves.toMatchObject({ status: 'queued' });
    expect((await t.executionsOf(task.id))[0]).toMatchObject({
      status: 'failed',
      failureReason: 'interrupted',
    });
  });
});
