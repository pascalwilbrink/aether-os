import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { actingAs, testPrincipal } from '@aether-os/krepis/testing';
import { AgentsService, AgentVersionsService } from '@hephaestus/agents';
import { LanguageModels, ModelGateway, SecretStore } from '@hephaestus/models';
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
import { ExecutionsService } from './executions.service.js';
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
            factory: (gateway: ModelGateway) => new MastraAgentRuntime(gateway),
            inject: [ModelGateway],
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
        .get(ExecutionsService)
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
      usage: { modelCalls: 1, inputTokens: 120, outputTokens: 9 },
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
      cost_usd: null,
      finish_reason: 'stop',
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
});
