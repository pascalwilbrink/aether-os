import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { actingAs, testPrincipal } from '@aether-os/krepis/testing';
import { AgentsService, AgentVersionsService } from '@hephaestus/agents';
import {
  ArtifactRejectedError,
  ArtifactsService,
  MAX_CONTENT_BYTES,
} from '@hephaestus/artifacts';
import { TasksService } from '@hephaestus/tasks';

import type { FakePolis } from '../../../test/fake-polis.js';
import {
  FakeAgentRuntime,
  FakeSandboxProvisioner,
  FakeTaskTokens,
  testRunnerOptions,
  untilAborted,
} from '../../../test/fake-runner.js';
import { createTestingModuleWith } from '../../../test/testing-module.js';
import { AgentRuntime, type AgentRunInput } from './agent-runtime.js';
import { RunnerModule } from './runner.module.js';
import { RUNNER_OPTIONS } from './runner.options.js';
import { SandboxProvisioner } from './sandbox-provisioner.js';
import { TaskRunner } from './task-runner.js';
import { TaskTokens } from './task-tokens.js';

const SERVICE_ACCOUNT = '0193a1b2-c3d4-7e5f-8a9b-0000000000aa';

describe('Artifacts from executions (Postgres)', () => {
  let moduleRef: TestingModule;
  let polis: FakePolis;
  let runtime: FakeAgentRuntime;
  let organizationId: string;
  let projectId: string;
  let tasks: TasksService;
  let artifacts: ArtifactsService;
  let agentId: string;
  let key = 0;

  beforeEach(async () => {
    runtime = new FakeAgentRuntime();
    ({ moduleRef, polis } = await createTestingModuleWith(
      (builder) =>
        builder
          .overrideProvider(RUNNER_OPTIONS)
          .useValue(testRunnerOptions({ maxExecutions: 1 }))
          .overrideProvider(AgentRuntime)
          .useValue(runtime)
          .overrideProvider(TaskTokens)
          .useValue(new FakeTaskTokens())
          .overrideProvider(SandboxProvisioner)
          .useValue(new FakeSandboxProvisioner()),
      RunnerModule,
    ));
    organizationId = polis.organization();
    projectId = polis.project(organizationId);
    const caller = testPrincipal({
      sub: 'user-1',
      subType: 'user',
      organizationId,
      organizationRoles: ['owner'],
      scopes: [],
    });
    tasks = actingAs(moduleRef.get(TasksService), caller);
    artifacts = moduleRef.get(ArtifactsService);

    const agents = actingAs(moduleRef.get(AgentsService), caller);
    const versions = actingAs(moduleRef.get(AgentVersionsService), caller);
    agentId = (
      await agents.create(organizationId, { name: 'Writer', description: '' })
    ).id;
    const version = await versions.create(organizationId, agentId, {
      instructions: 'Write.',
      model: { provider: 'scripted', model: 'scripted-model' },
      capabilities: ['chat'],
      tools: [],
      skills: [],
      runtime: {
        provider: 'mastra',
        executionMode: 'standard',
        sandboxRequired: false,
      },
    });
    await versions.publish(organizationId, agentId, version.id);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  const createTask = async () =>
    (
      await tasks.create(
        organizationId,
        projectId,
        {
          title: 'Write it up',
          instructions: 'A summary, please.',
          agentId,
          serviceAccountId: SERVICE_ACCOUNT,
        },
        `key-${++key}`,
      )
    ).task;

  async function runOnce() {
    const runner = moduleRef.get(TaskRunner);
    await runner.tick();
    await runner.drain();
  }

  const task = (id: string) => tasks.findById(organizationId, projectId, id);
  const artifactsOf = async (taskId: string) =>
    (await artifacts.list(organizationId, projectId, taskId, { limit: 100 }))
      .items;
  const text = (title: string, primary?: boolean) =>
    ({
      kind: 'text',
      format: 'markdown',
      title,
      content: `# ${title}`,
      primary,
    }) as const;
  const events = async () =>
    (
      (await moduleRef
        .get(DataSource)
        .query('SELECT message FROM outbox ORDER BY created_at, id')) as {
        message: { eventType: string; payload: Record<string, unknown> };
      }[]
    ).map((row) => row.message);

  it('makes what the agent recorded final, with the one it marked as the primary outcome', async () => {
    runtime.behaviour = async ({ artifacts: sink }) => {
      await sink.submit(text('Notes'));
      await sink.submit({
        kind: 'json',
        title: 'Findings',
        schema: 'findings/v1',
        content: { bugs: 2 },
        primary: true,
      });
      return { outcome: 'completed', summary: 'Two bugs found.' };
    };
    const created = await createTask();

    await runOnce();

    const all = await artifactsOf(created.id);
    expect(all).toEqual([
      expect.objectContaining({
        kind: 'text',
        title: 'Notes',
        status: 'final',
        primary: false,
        format: 'markdown',
        content: '# Notes',
      }),
      expect.objectContaining({
        kind: 'json',
        title: 'Findings',
        status: 'final',
        primary: true,
        schema: 'findings/v1',
        content: { bugs: 2 },
        taskId: created.id,
        agentVersionId: created.agentVersionId,
        version: 2,
      }),
    ]);
    // The final answer isn't another artifact: one was marked primary.
    await expect(task(created.id)).resolves.toMatchObject({
      status: 'succeeded',
      primaryArtifactId: all[1].id,
    });

    const published = await events();
    expect(
      published
        .filter((event) => event.eventType.startsWith('artifact.'))
        .map((event) => [
          event.eventType,
          event.payload['status'] ?? event.payload['to'],
        ]),
    ).toEqual([
      ['artifact.created', 'pending'],
      ['artifact.created', 'pending'],
      ['artifact.status-changed', 'final'],
      ['artifact.status-changed', 'final'],
    ]);
    expect(
      published.find((event) => event.eventType === 'task.succeeded')?.payload,
    ).toMatchObject({
      primaryArtifactId: all[1].id,
      artifactIds: [all[0].id, all[1].id],
    });
  });

  it("makes the agent's final answer the outcome when it recorded none as primary", async () => {
    const created = await createTask();

    await runOnce();

    expect(await artifactsOf(created.id)).toEqual([
      expect.objectContaining({
        kind: 'text',
        title: 'Answer',
        format: 'markdown',
        content: 'Done.',
        status: 'final',
        primary: true,
      }),
    ]);
  });

  it('makes its latest artifact the outcome when there is no answer either', async () => {
    runtime.behaviour = async ({ artifacts: sink }) => {
      await sink.submit(text('First'));
      await sink.submit(text('Second'));
      return { outcome: 'completed', summary: '' };
    };
    const created = await createTask();

    await runOnce();

    expect(
      (await artifactsOf(created.id)).map((a) => [a.title, a.primary]),
    ).toEqual([
      ['First', false],
      ['Second', true],
    ]);
  });

  it('fails a task that finished without any outcome', async () => {
    runtime.behaviour = () =>
      Promise.resolve({ outcome: 'completed', summary: '  ' });
    const created = await createTask();

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'agent_failed',
      primaryArtifactId: null,
    });
  });

  it('keeps what a failed execution recorded as partial, never primary', async () => {
    let tries = 0;
    runtime.behaviour = async ({ artifacts: sink }: AgentRunInput) => {
      tries++;
      await sink.submit(text(`Try ${tries}`, true));
      if (tries === 1) {
        throw new Error('sandbox crashed');
      }
      return { outcome: 'completed', summary: 'Done.' };
    };
    const created = await createTask();

    await runOnce();
    expect(await artifactsOf(created.id)).toEqual([
      expect.objectContaining({
        title: 'Try 1',
        status: 'partial',
        primary: false,
      }),
    ]);

    // The retried execution's artifact is the outcome; the partial one stays.
    await runOnce();
    const all = await artifactsOf(created.id);
    expect(all.map((a) => [a.title, a.status, a.primary])).toEqual([
      ['Try 1', 'partial', false],
      ['Try 2', 'final', true],
    ]);
    await expect(task(created.id)).resolves.toMatchObject({
      status: 'succeeded',
      primaryArtifactId: all[1].id,
    });
  });

  it('records nothing past the limits, or once the execution has ended', async () => {
    let sink: AgentRunInput['artifacts'] | undefined;
    let tooBig: unknown;
    runtime.behaviour = async (input) => {
      sink = input.artifacts;
      tooBig = await sink
        .submit({ ...text('Huge'), content: 'x'.repeat(MAX_CONTENT_BYTES + 1) })
        .catch((error: unknown) => error);
      return untilAborted(input.signal);
    };
    const created = await createTask();
    const runner = moduleRef.get(TaskRunner);
    await runner.tick();
    for (let i = 0; i < 200 && !sink; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(tooBig).toBeInstanceOf(ArtifactRejectedError);

    await tasks.cancel(organizationId, projectId, created.id);
    await runner.heartbeat();
    await runner.drain();

    await expect(sink!.submit(text('Late'))).rejects.toBeInstanceOf(
      ArtifactRejectedError,
    );
    expect(await artifactsOf(created.id)).toEqual([]);
  });

  it('lets only the last artifact marked primary be the outcome', async () => {
    runtime.behaviour = async ({ artifacts: sink }) => {
      await sink.submit(text('Draft one', true));
      await sink.submit(text('Draft two', true));
      return { outcome: 'completed', summary: 'Done.' };
    };
    const created = await createTask();

    await runOnce();

    expect(
      (await artifactsOf(created.id)).map((a) => [a.title, a.primary]),
    ).toEqual([
      ['Draft one', false],
      ['Draft two', true],
    ]);
  });
});
