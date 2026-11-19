import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { actingAs, testPrincipal } from '@aether-os/krepis/testing';
import { AgentsService, AgentVersionsService } from '@hephaestus/agents';
import { ArtifactsService } from '@hephaestus/artifacts';
import type { ApiTypes } from '@hephaestus/core';
import { InvalidTaskCriteriaError, TasksService } from '@hephaestus/tasks';

import type { FakePolis } from '../../../test/fake-polis.js';
import {
  FakeAgentRuntime,
  FakeSandboxProvisioner,
  FakeTaskTokens,
  testRunnerOptions,
} from '../../../test/fake-runner.js';
import { createTestingModuleWith } from '../../../test/testing-module.js';
import { AgentRuntime } from './agent-runtime.js';
import { ExecutionHistory } from './execution-history.js';
import { RunnerModule } from './runner.module.js';
import { RUNNER_OPTIONS } from './runner.options.js';
import { SandboxProvisioner } from './sandbox-provisioner.js';
import { TaskRunner } from './task-runner.js';
import { TaskTokens } from './task-tokens.js';

const SERVICE_ACCOUNT = '0193a1b2-c3d4-7e5f-8a9b-0000000000aa';

const TESTS_PASS: ApiTypes.AcceptanceCriterionRequest = {
  key: 'tests-pass',
  description: 'The tests pass',
  check: { type: 'command', command: 'pnpm test', timeoutSeconds: 60 },
};
const JSON_OUTCOME: ApiTypes.AcceptanceCriterionRequest = {
  key: 'json-outcome',
  description: 'The outcome is a JSON report',
  check: { type: 'artifact', primaryKind: 'json', titles: ['Report'] },
};
const READS_WELL: ApiTypes.AcceptanceCriterionRequest = {
  key: 'reads-well',
  description: 'The report reads well',
  check: { type: 'manual' },
};

describe('Verification (Postgres)', () => {
  let moduleRef: TestingModule;
  let polis: FakePolis;
  let runtime: FakeAgentRuntime;
  let sandboxes: FakeSandboxProvisioner;
  let organizationId: string;
  let projectId: string;
  let tasks: TasksService;
  let key = 0;

  beforeEach(async () => {
    runtime = new FakeAgentRuntime();
    sandboxes = new FakeSandboxProvisioner();
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
          .useValue(sandboxes),
      RunnerModule,
    ));
    organizationId = polis.organization();
    projectId = polis.project(organizationId);
    tasks = actingAs(
      moduleRef.get(TasksService),
      testPrincipal({
        sub: 'user-1',
        subType: 'user',
        organizationId,
        organizationRoles: ['owner'],
        scopes: [],
      }),
    );
    // The agent writes a JSON report, marked as the outcome.
    runtime.behaviour = async ({ artifacts }) => {
      await artifacts.submit({
        kind: 'json',
        title: 'Report',
        content: { ok: true },
        primary: true,
      });
      return { outcome: 'completed', summary: 'Report written.' };
    };
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  async function taskWith(
    acceptanceCriteria: ApiTypes.AcceptanceCriterionRequest[],
    options: { sandboxRequired?: boolean; artifactKinds?: string[] } = {},
  ) {
    const owner = testPrincipal({
      sub: 'user-1',
      subType: 'user',
      organizationId,
      organizationRoles: ['owner'],
      scopes: [],
    });
    const agents = actingAs(moduleRef.get(AgentsService), owner);
    const versions = actingAs(moduleRef.get(AgentVersionsService), owner);
    const agentId = (
      await agents.create(organizationId, { name: 'Checker', description: '' })
    ).id;
    const version = await versions.create(organizationId, agentId, {
      instructions: 'Do the work.',
      model: { provider: 'scripted', model: 'scripted-model' },
      capabilities: ['code'],
      tools: [],
      skills: [],
      runtime: {
        provider: 'mastra',
        executionMode: 'standard',
        sandboxRequired: options.sandboxRequired ?? true,
      },
    });
    await versions.publish(organizationId, agentId, version.id);
    return (
      await tasks.create(
        organizationId,
        projectId,
        {
          title: 'Make the tests pass',
          instructions: 'And report.',
          agentId,
          serviceAccountId: SERVICE_ACCOUNT,
          acceptanceCriteria,
          review: { artifactKinds: options.artifactKinds ?? [] },
        },
        `key-${++key}`,
      )
    ).task;
  }

  async function runOnce() {
    const runner = moduleRef.get(TaskRunner);
    await runner.tick();
    await runner.drain();
  }

  const task = (id: string) => tasks.findById(organizationId, projectId, id);
  const verifications = async (taskId: string) =>
    (
      await moduleRef
        .get(ArtifactsService)
        .list(organizationId, projectId, taskId, { limit: 100 })
    ).items.filter((artifact) => artifact.kind === 'verification');
  const outbox = async () =>
    (
      (await moduleRef
        .get(DataSource)
        .query('SELECT message FROM outbox ORDER BY created_at, id')) as {
        message: { eventType: string; payload: Record<string, unknown> };
      }[]
    ).map((row) => row.message);

  it('checks every criterion after the run, and succeeds when they hold', async () => {
    sandboxes.commands.set('pnpm test', [
      { exitCode: 0, output: '12 passing' },
    ]);
    const created = await taskWith([TESTS_PASS, JSON_OUTCOME, READS_WELL]);
    expect(created.acceptanceCriteria).toEqual([
      { ...TESTS_PASS, source: 'task' },
      { ...JSON_OUTCOME, source: 'task' },
      { ...READS_WELL, source: 'task' },
    ]);

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'succeeded',
    });
    expect(sandboxes.ran).toEqual(['pnpm test']);
    expect(await verifications(created.id)).toEqual([
      expect.objectContaining({
        status: 'final',
        primary: false,
        round: 1,
        results: [
          { key: 'tests-pass', outcome: 'passed', output: '12 passing' },
          {
            key: 'json-outcome',
            outcome: 'passed',
            output: 'The artifacts are as expected.',
          },
          {
            key: 'reads-well',
            outcome: 'manual',
            output: 'Left to the reviewer.',
          },
        ],
      }),
    ]);
    const events = await outbox();
    expect(
      events.find((event) => event.eventType === 'task.verified')?.payload,
    ).toEqual({
      taskId: created.id,
      executionId: expect.any(String),
      agentVersionId: created.agentVersionId,
      round: 1,
      passed: true,
      results: [
        { key: 'tests-pass', outcome: 'passed' },
        { key: 'json-outcome', outcome: 'passed' },
        { key: 'reads-well', outcome: 'manual' },
      ],
    });
    expect(
      events
        .filter(
          (event) =>
            event.eventType === 'task.status-changed' &&
            event.payload['taskId'] === created.id,
        )
        .map((event) => [event.payload['to'], event.payload['reason']]),
    ).toEqual([
      ['provisioning', 'provision'],
      ['running', 'sandbox-ready'],
      ['verifying', 'agent-finished'],
      ['delivering', 'verified'],
      ['succeeded', 'nothing-to-deliver'],
    ]);
  });

  it('sends failures back to the agent in the same execution until they pass', async () => {
    sandboxes.commands.set('pnpm test', [
      { exitCode: 1, output: '1 failing' },
      { exitCode: 0, output: '13 passing' },
    ]);
    const created = await taskWith([TESTS_PASS]);

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'succeeded',
    });
    // One execution, two runs of the agent: the second with what failed.
    const executions = await moduleRef
      .get(ExecutionHistory)
      .list(organizationId, projectId, created.id, { limit: 10 });
    expect(executions.items).toHaveLength(1);
    expect(runtime.runs).toHaveLength(2);
    expect(runtime.runs[0].failedChecks).toEqual([]);
    expect(runtime.runs[1].failedChecks).toEqual([
      {
        key: 'tests-pass',
        description: 'The tests pass',
        output: 'Exit code 1.\n1 failing',
      },
    ]);
    expect(
      (await verifications(created.id)).map((v) => [
        v.round,
        v.results[0].outcome,
      ]),
    ).toEqual([
      [1, 'failed'],
      [2, 'passed'],
    ]);
  });

  it('fails the task when the criteria still fail after the last round', async () => {
    sandboxes.commands.set('pnpm test', [{ exitCode: 1, output: 'nope' }]);
    const created = await taskWith([TESTS_PASS]);

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'verification_failed',
      primaryArtifactId: null,
    });
    expect(runtime.runs).toHaveLength(3);
    const [execution] = (
      await moduleRef
        .get(ExecutionHistory)
        .list(organizationId, projectId, created.id, { limit: 10 })
    ).items;
    expect(execution).toMatchObject({
      status: 'failed',
      failureReason: 'verification_failed',
      error: 'Acceptance criteria still failing after 3 rounds: tests-pass',
    });
    // What was produced stays for inspection, with the checks that failed.
    expect(
      (await verifications(created.id)).map((v) => [v.round, v.status]),
    ).toEqual([
      [1, 'partial'],
      [2, 'partial'],
      [3, 'partial'],
    ]);
  });

  it('verifies before review: drafts only go to reviewers once the checks pass', async () => {
    const created = await taskWith([JSON_OUTCOME], { artifactKinds: ['*'] });

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'awaiting_review',
    });
    expect(await verifications(created.id)).toEqual([
      expect.objectContaining({ status: 'final', round: 1 }),
    ]);
  });

  it('reports what an artifact check found missing', async () => {
    runtime.behaviour = () =>
      Promise.resolve({ outcome: 'completed', summary: 'Just text.' });
    const created = await taskWith([JSON_OUTCOME], { sandboxRequired: false });

    await runOnce();

    const [first] = await verifications(created.id);
    expect(first.results).toEqual([
      {
        key: 'json-outcome',
        outcome: 'failed',
        output:
          'The primary artifact is a text artifact, not json.\nNo artifact titled "Report".',
      },
    ]);
  });

  it("refuses command checks for an agent version that doesn't run in a sandbox", async () => {
    const created = await taskWith([TESTS_PASS], { sandboxRequired: false });

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'infrastructure',
    });
    expect(runtime.runs).toHaveLength(0);
  });

  it('needs unique criterion keys', async () => {
    await expect(taskWith([TESTS_PASS, TESTS_PASS])).rejects.toBeInstanceOf(
      InvalidTaskCriteriaError,
    );
  });
});
