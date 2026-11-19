import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { actingAs, testPrincipal } from '@aether-os/krepis/testing';
import { AgentsService, AgentVersionsService } from '@hephaestus/agents';
import { ArtifactsService } from '@hephaestus/artifacts';
import { SecretStore } from '@hephaestus/core';
import {
  LanguageModels,
  BudgetsService,
  ModelGateway,
} from '@hephaestus/models';
import { TasksService } from '@hephaestus/tasks';

import type { FakePolis } from '../../../test/fake-polis.js';
import {
  FakeSecretStore,
  ScriptedLanguageModels,
} from '../../../test/fake-models.js';
import {
  FakeSandboxProvisioner,
  FakeTaskTokens,
  testRunnerOptions,
} from '../../../test/fake-runner.js';
import { createTestingModuleWith } from '../../../test/testing-module.js';
import { AgentRuntime } from './agent-runtime.js';
import { ExecutionHistory } from './execution-history.js';
import { MastraAgentRuntime } from './mastra-agent-runtime.js';
import { RunnerModule } from './runner.module.js';
import { RUNNER_OPTIONS } from './runner.options.js';
import { SandboxProvisioner } from './sandbox-provisioner.js';
import { TaskRunner } from './task-runner.js';
import { TaskTokens } from './task-tokens.js';

const SERVICE_ACCOUNT = '0193a1b2-c3d4-7e5f-8a9b-0000000000aa';

describe('MastraAgentRuntime (Postgres)', () => {
  let moduleRef: TestingModule;
  let polis: FakePolis;
  let secrets: FakeSecretStore;
  let models: ScriptedLanguageModels;
  let organizationId: string;
  let projectId: string;
  let tasks: TasksService;
  let key = 0;

  beforeEach(async () => {
    secrets = new FakeSecretStore();
    models = new ScriptedLanguageModels();
    ({ moduleRef, polis } = await createTestingModuleWith(
      (builder) =>
        builder
          // One execution per round, so a retried failure waits for the next.
          .overrideProvider(RUNNER_OPTIONS)
          .useValue(testRunnerOptions({ maxExecutions: 1 }))
          .overrideProvider(AgentRuntime)
          .useFactory({
            factory: (gateway: ModelGateway, budgets: BudgetsService) =>
              new MastraAgentRuntime(gateway, budgets),
            inject: [ModelGateway, BudgetsService],
          })
          .overrideProvider(SecretStore)
          .useValue(secrets)
          .overrideProvider(LanguageModels)
          .useValue(models)
          .overrideProvider(TaskTokens)
          .useValue(new FakeTaskTokens())
          .overrideProvider(SandboxProvisioner)
          .useValue(new FakeSandboxProvisioner()),
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
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  /** A task for an agent whose published version has these settings. */
  async function taskFor(
    version: {
      tools?: { name: string; enabled: boolean }[];
    } = {},
  ) {
    const caller = testPrincipal({
      sub: 'user-1',
      subType: 'user',
      organizationId,
      organizationRoles: ['owner'],
      scopes: [],
    });
    const agents = actingAs(moduleRef.get(AgentsService), caller);
    const versions = actingAs(moduleRef.get(AgentVersionsService), caller);
    const agentId = (
      await agents.create(organizationId, { name: 'Fixer', description: '' })
    ).id;
    const created = await versions.create(organizationId, agentId, {
      instructions: 'You fix bugs. Answer with what you changed.',
      model: {
        // Not in Mastra's model registry: for providers it knows, it drops
        // settings it believes a model doesn't support (e.g. temperature).
        provider: 'scripted',
        model: 'scripted-model',
        temperature: 0.3,
        maxTokens: 2000,
      },
      capabilities: ['chat'],
      tools: version.tools ?? [],
      skills: [],
      runtime: {
        provider: 'mastra',
        executionMode: 'standard',
        sandboxRequired: false,
      },
    });
    await versions.publish(organizationId, agentId, created.id);
    const { task } = await tasks.create(
      organizationId,
      projectId,
      {
        title: 'Fix the login bug',
        instructions: 'Uppercase emails cannot sign in.',
        agentId,
        serviceAccountId: SERVICE_ACCOUNT,
      },
      `key-${++key}`,
    );
    return { task, versionId: created.id };
  }

  async function runOnce() {
    const runner = moduleRef.get(TaskRunner);
    await runner.tick();
    await runner.drain();
  }

  const task = (id: string) => tasks.findById(organizationId, projectId, id);
  const executionsOf = async (id: string) =>
    (
      await moduleRef
        .get(ExecutionHistory)
        .list(organizationId, projectId, id, { limit: 50 })
    ).items;

  it("runs the agent version with the organization's key, and meters the call", async () => {
    secrets.secrets.set(`orgs/${organizationId}/llm/scripted`, {
      apiKey: 'sk-organization',
    });
    models.replies = [
      {
        text: 'Lowercased emails at sign-in.',
        inputTokens: 120,
        outputTokens: 9,
        cachedInputTokens: 100,
      },
    ];
    const { task: created, versionId } = await taskFor();

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'succeeded',
    });
    const [execution] = await executionsOf(created.id);
    expect(execution).toMatchObject({
      status: 'completed',
      summary: 'Lowercased emails at sign-in.',
      // At the test catalogue's price ($3 in, $0.30 cache reads, $15 out):
      // 20 × 3 + 100 × 0.3 + 9 × 15 = 225 millionths of a dollar.
      usage: {
        modelCalls: 1,
        inputTokens: 120,
        outputTokens: 9,
        cacheReadTokens: 100,
        cacheWriteTokens: 0,
        costUsd: '0.000225',
      },
    });

    // The pinned version's model, settings and instructions, with the key.
    expect(models.created).toEqual([
      { id: 'scripted/scripted-model', apiKey: 'sk-organization' },
    ]);
    const [call] = models.calls;
    expect(call).toMatchObject({ temperature: 0.3, maxOutputTokens: 2000 });
    expect(call.prompt[0]).toEqual({
      role: 'system',
      content: 'You fix bugs. Answer with what you changed.',
    });
    expect(JSON.stringify(call.prompt.at(-1))).toContain(
      '# Fix the login bug\\n\\nUppercase emails cannot sign in.',
    );

    const [row] = (await moduleRef
      .get(DataSource)
      .query('SELECT * FROM model_calls')) as Record<string, unknown>[];
    expect(row).toMatchObject({
      organization_id: organizationId,
      project_id: projectId,
      task_id: created.id,
      execution_id: execution.id,
      agent_version_id: versionId,
      provider: 'scripted',
      model: 'scripted-model',
      key_source: 'organization',
      input_tokens: 120,
      output_tokens: 9,
      cache_read_tokens: 100,
      cache_write_tokens: null,
      cost_usd: '0.000225',
      finish_reason: 'stop',
    });
  });

  it('records what the agent submits with submit_artifact', async () => {
    secrets.secrets.set(`orgs/${organizationId}/llm/scripted`, {
      apiKey: 'sk-organization',
    });
    models.replies = [
      {
        toolCall: {
          tool: 'submit_artifact',
          input: {
            kind: 'json',
            title: 'Fix',
            content: '{"fixed":true}',
            primary: true,
          },
        },
      },
      {
        toolCall: {
          tool: 'submit_artifact',
          input: { kind: 'json', title: 'Broken', content: 'not json' },
        },
      },
      { text: 'All done.' },
    ];
    const { task: created } = await taskFor();

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'succeeded',
    });
    // The invalid one went back to the agent as a tool error.
    expect(JSON.stringify(models.calls[2].prompt.at(-1))).toContain(
      'content is not valid JSON',
    );
    const artifacts = (
      await moduleRef
        .get(ArtifactsService)
        .list(organizationId, projectId, created.id, { limit: 10 })
    ).items.filter((artifact) => artifact.kind !== 'verification');
    expect(artifacts).toEqual([
      expect.objectContaining({
        kind: 'json',
        title: 'Fix',
        content: { fixed: true },
        status: 'final',
        primary: true,
      }),
    ]);
    const [execution] = await executionsOf(created.id);
    expect(execution).toMatchObject({
      summary: 'All done.',
      usage: { modelCalls: 3 },
    });
  });

  it('fails without retrying when no key is stored for the provider', async () => {
    const { task: created } = await taskFor();

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'infrastructure',
    });
    const [execution] = await executionsOf(created.id);
    expect(execution.error).toContain('No key for model provider scripted');
    expect(execution.usage.modelCalls).toBe(0);
  });

  it('fails without retrying when the provider refuses the key', async () => {
    secrets.secrets.set(`orgs/${organizationId}/llm/scripted`, {
      apiKey: 'sk-revoked',
    });
    models.replies = [
      { error: { message: 'invalid x-api-key', statusCode: 401 } },
    ];
    const { task: created } = await taskFor();

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'infrastructure',
    });
    expect((await executionsOf(created.id))[0].error).toContain(
      'The model provider refused the call (401)',
    );
  });

  it('retries the task when the provider is overloaded', async () => {
    secrets.secrets.set(`orgs/${organizationId}/llm/scripted`, {
      apiKey: 'sk-organization',
    });
    models.replies = [
      { error: { message: 'Overloaded', statusCode: 529 } },
      { text: 'Fixed.', inputTokens: 10, outputTokens: 2 },
    ];
    const { task: created } = await taskFor();

    await runOnce();
    await expect(task(created.id)).resolves.toMatchObject({ status: 'queued' });
    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'succeeded',
    });
    expect(
      (await executionsOf(created.id)).map((e) => [e.number, e.status]),
    ).toEqual([
      [2, 'completed'],
      [1, 'failed'],
    ]);
  });

  it("refuses an agent version with tools it can't run yet", async () => {
    secrets.secrets.set(`orgs/${organizationId}/llm/scripted`, {
      apiKey: 'sk-organization',
    });
    const { task: created } = await taskFor({
      tools: [{ name: 'github', enabled: true }],
    });

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'infrastructure',
    });
    expect((await executionsOf(created.id))[0].error).toBe(
      "Tools and skills aren't supported yet (github)",
    );
    expect(models.calls).toHaveLength(0);
  });

  describe('budgets (docs/models.md)', () => {
    const owner = () =>
      testPrincipal({
        sub: 'user-1',
        subType: 'user',
        organizationId,
        organizationRoles: ['owner'],
        scopes: [],
      });
    const budgets = () => actingAs(moduleRef.get(BudgetsService), owner());
    /** Events of a type in the outbox, oldest first. */
    const published = async (eventType: string) =>
      (
        (await moduleRef
          .get(DataSource)
          .query(
            `SELECT message->'payload' AS payload FROM outbox WHERE routing_key = $1 ORDER BY created_at`,
            [eventType],
          )) as { payload: Record<string, unknown> }[]
      ).map((row) => row.payload);

    beforeEach(() => {
      secrets.secrets.set(`orgs/${organizationId}/llm/scripted`, {
        apiKey: 'sk-organization',
      });
    });

    it('pauses a run when its task tree budget runs out, and resumes it once raised', async () => {
      // The tool call costs 1 × $3 + 1 × $15 per million tokens: $0.000018.
      models.replies = [
        {
          toolCall: {
            tool: 'submit_artifact',
            input: { kind: 'text', title: 'Notes', content: 'Half done.' },
          },
        },
        { text: 'Done.' },
      ];
      const { task: created } = await taskFor();
      await budgets().setTaskTree(
        organizationId,
        projectId,
        created.id,
        '0.00001',
      );

      await runOnce();

      // Stopped after the first call: the second never happened.
      expect(models.calls).toHaveLength(1);
      await expect(task(created.id)).resolves.toMatchObject({
        status: 'paused',
        pausedFor: 'task_tree',
      });
      const [paused] = await executionsOf(created.id);
      expect(paused).toMatchObject({
        status: 'paused',
        error: 'The task tree budget ran out',
        usage: { modelCalls: 1, costUsd: '0.000018' },
      });
      // Its unfinished work isn't carried over.
      expect(
        (
          await actingAs(moduleRef.get(ArtifactsService), owner()).list(
            organizationId,
            projectId,
            created.id,
            { limit: 50 },
          )
        ).items.map((artifact) => artifact.status),
      ).toEqual(['partial']);
      expect(await published('task.paused')).toEqual([
        {
          taskId: created.id,
          topLevelTaskId: created.id,
          requestedBy: 'user-1',
          scope: 'task_tree',
        },
      ]);
      expect(await published('budget.threshold-reached')).toEqual([
        expect.objectContaining({
          scope: 'task_tree',
          scopeId: created.id,
          limitUsd: '0.000010',
          spentUsd: '0.000018',
          windowStart: null,
        }),
      ]);

      // Still paused while the budget has no room.
      await runOnce();
      await expect(task(created.id)).resolves.toMatchObject({
        status: 'paused',
      });

      await budgets().setTaskTree(organizationId, projectId, created.id, '1');
      await runOnce();

      await expect(task(created.id)).resolves.toMatchObject({
        status: 'succeeded',
        pausedFor: null,
      });
      expect(await executionsOf(created.id)).toHaveLength(2);
      expect(await published('task.resumed')).toEqual([
        { taskId: created.id, topLevelTaskId: created.id },
      ]);
      await expect(
        budgets().getTaskTree(organizationId, created.id),
      ).resolves.toMatchObject({ limitUsd: '1.000000', spentUsd: '0.000018' });
    });

    it('pauses a task before it starts when the organization spent its month', async () => {
      await budgets().setOrganization(organizationId, '0');
      const { task: created } = await taskFor();

      await runOnce();

      expect(models.calls).toHaveLength(0);
      await expect(task(created.id)).resolves.toMatchObject({
        status: 'paused',
        pausedFor: 'organization',
      });
      expect((await executionsOf(created.id))[0]).toMatchObject({
        status: 'paused',
        error: 'The organization budget ran out',
      });

      // Removing the limit lets it run.
      await budgets().setOrganization(organizationId, null);
      await runOnce();
      await expect(task(created.id)).resolves.toMatchObject({
        status: 'succeeded',
      });
    });

    it("pauses an agent's tasks in every project once it spent its month", async () => {
      const { task: first } = await taskFor();
      await budgets().setAgent(organizationId, first.agentId, '0.00001');
      models.replies = [{ text: 'Done.', inputTokens: 1, outputTokens: 1 }];

      await runOnce();

      // The first run used the month up: its answer stays, the next pauses.
      await expect(task(first.id)).resolves.toMatchObject({
        status: 'succeeded',
      });
      await expect(
        budgets().getAgent(organizationId, first.agentId),
      ).resolves.toMatchObject({ scope: 'agent', spentUsd: '0.000018' });
      // Another task of the same agent, in another project.
      const otherProject = polis.project(organizationId);
      const { task: second } = await tasks.create(
        organizationId,
        otherProject,
        {
          title: 'Fix another bug',
          instructions: 'Please.',
          agentId: first.agentId,
          serviceAccountId: SERVICE_ACCOUNT,
        },
        `key-${++key}`,
      );
      await runOnce();
      expect(models.calls).toHaveLength(1);
      await expect(
        tasks.findById(organizationId, otherProject, second.id),
      ).resolves.toMatchObject({ status: 'paused', pausedFor: 'agent' });

      await budgets().setAgent(organizationId, first.agentId, '1');
      models.replies = [{ text: 'Done again.' }];
      await runOnce();
      await expect(
        tasks.findById(organizationId, otherProject, second.id),
      ).resolves.toMatchObject({ status: 'succeeded', pausedFor: null });
    });

    it("keeps a run's answer when its last call used up the budget", async () => {
      models.replies = [{ text: 'Fixed.', inputTokens: 10, outputTokens: 2 }];
      await budgets().setProject(organizationId, projectId, '0.00001');
      const { task: created } = await taskFor();

      await runOnce();

      // The run ended on its own: the budget pauses the next one, not this.
      await expect(task(created.id)).resolves.toMatchObject({
        status: 'succeeded',
      });
      await expect(
        budgets().exceeded({
          organizationId,
          projectId,
          agentId: created.agentId,
          topLevelTaskId: created.id,
        }),
      ).resolves.toBe('project');
    });
  });
});
