import type { TestingModule } from '@nestjs/testing';
import Docker from 'dockerode';
import { DataSource } from 'typeorm';

import { actingAs, testPrincipal } from '@aether-os/krepis/testing';
import { AgentsService, AgentVersionsService } from '@hephaestus/agents';
import { LanguageModels, ModelGateway, SecretStore } from '@hephaestus/models';
import { TasksService } from '@hephaestus/tasks';
import { WorkspacesService } from '@hephaestus/workspaces';

import {
  FakeSecretStore,
  ScriptedLanguageModels,
} from '../../../test/fake-models.js';
import type { FakePolis } from '../../../test/fake-polis.js';
import {
  FakeTaskTokens,
  testRunnerOptions,
} from '../../../test/fake-runner.js';
import { createTestingModuleWith } from '../../../test/testing-module.js';
import { AgentRuntime } from './agent-runtime.js';
import { DockerSandboxDriver } from './docker-sandbox-driver.js';
import { MastraAgentRuntime } from './mastra-agent-runtime.js';
import { RunnerModule } from './runner.module.js';
import { RUNNER_OPTIONS } from './runner.options.js';
import { SandboxDriver } from './sandbox-driver.js';
import { SandboxProvisioner } from './sandbox-provisioner.js';
import { TaskRunner } from './task-runner.js';
import { TaskTokens } from './task-tokens.js';
import {
  SANDBOX_OPTIONS,
  WorkspaceSandboxProvisioner,
  type SandboxOptions,
} from './workspace-sandbox-provisioner.js';

const SERVICE_ACCOUNT = '0193a1b2-c3d4-7e5f-8a9b-0000000000aa';
const docker = new Docker();

/** Small and quick to pull; sandboxes only need a shell. */
const sandboxOptions: SandboxOptions = {
  image: 'alpine:3.20',
  user: '1000:1000',
  cpus: 0.5,
  memoryMb: 256,
  pidsLimit: 64,
  workspaceMb: 64,
  lifetimeMs: 600_000,
};

/** The test's sandbox containers (labelled by the driver). */
async function sandboxContainers(executionId?: string) {
  return docker.listContainers({
    all: true,
    filters: {
      label: [
        'aether-os.sandbox=true',
        ...(executionId ? [`aether-os.execution-id=${executionId}`] : []),
      ],
    },
  });
}

afterAll(async () => {
  for (const container of await sandboxContainers()) {
    await docker.getContainer(container.Id).remove({ force: true });
  }
});

// Containers start in seconds, more on a busy CI runner.
vi.setConfig({ testTimeout: 60_000 });

describe('DockerSandboxDriver (Docker)', () => {
  const driver = new DockerSandboxDriver(docker);
  const sandboxId = '0193a1b2-c3d4-7e5f-8a9b-00000000d0c1';

  it('creates a hardened container, once per sandbox, and removes it', async () => {
    const spec = {
      sandboxId,
      ...sandboxOptions,
      workingDirectory: '/workspace',
      labels: { 'aether-os.execution-id': sandboxId },
    };
    const created = await driver.create(spec, new AbortController().signal);

    const info = await docker.getContainer(created.resourceId).inspect();
    expect(info.Config.User).toBe('1000:1000');
    // Nothing from Hephaestus's environment: HOME, and the image's PATH.
    expect(info.Config.Env).toHaveLength(2);
    expect(info.Config.Env).toEqual(
      expect.arrayContaining([
        'HOME=/workspace',
        expect.stringMatching(/^PATH=/),
      ]),
    );
    expect(info.HostConfig).toMatchObject({
      NetworkMode: 'none',
      ReadonlyRootfs: true,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges:true'],
      PidsLimit: 64,
      Memory: 256 * 1024 * 1024,
      NanoCpus: 500_000_000,
      Privileged: false,
      Init: true,
    });

    // As the agent's tools see it.
    const result = await created.agentSandbox.executeCommand!(
      'id -u; echo ok > /workspace/f && cat /workspace/f; touch /etc/x 2>&1; ls /root 2>&1; wget -q -T 1 http://example.com 2>&1',
    );
    expect(result.stdout + result.stderr).toMatch(
      /^1000\nok\n.*Read-only file system[\s\S]*Permission denied[\s\S]*bad address/,
    );

    // Creating again (a retried call) finds the same container.
    const again = await driver.create(spec, new AbortController().signal);
    expect(again.resourceId).toBe(created.resourceId);

    await driver.remove(sandboxId);
    await driver.remove(sandboxId);
    expect(await sandboxContainers(sandboxId)).toEqual([]);
  });

  it('refuses to run as root', async () => {
    await expect(
      driver.create(
        {
          sandboxId,
          ...sandboxOptions,
          user: '0:0',
          workingDirectory: '/workspace',
          labels: {},
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow('never run as root');
  });
});

describe('Sandboxes for executions (Docker, Postgres)', () => {
  let moduleRef: TestingModule;
  let polis: FakePolis;
  let models: ScriptedLanguageModels;
  let organizationId: string;
  let projectId: string;
  let tasks: TasksService;
  let key = 0;

  beforeEach(async () => {
    const secrets = new FakeSecretStore();
    models = new ScriptedLanguageModels();
    ({ moduleRef, polis } = await createTestingModuleWith(
      (builder) =>
        builder
          .overrideProvider(RUNNER_OPTIONS)
          .useValue(testRunnerOptions({ maxExecutions: 1 }))
          .overrideProvider(AgentRuntime)
          .useFactory({
            factory: (gateway: ModelGateway) => new MastraAgentRuntime(gateway),
            inject: [ModelGateway],
          })
          .overrideProvider(SANDBOX_OPTIONS)
          .useValue(sandboxOptions)
          .overrideProvider(SandboxProvisioner)
          .useFactory({
            factory: (
              workspaces: WorkspacesService,
              driver: SandboxDriver,
              options: SandboxOptions,
            ) => new WorkspaceSandboxProvisioner(workspaces, driver, options),
            inject: [WorkspacesService, SandboxDriver, SANDBOX_OPTIONS],
          })
          .overrideProvider(SecretStore)
          .useValue(secrets)
          .overrideProvider(LanguageModels)
          .useValue(models)
          .overrideProvider(TaskTokens)
          .useValue(new FakeTaskTokens()),
      RunnerModule,
    ));
    organizationId = polis.organization();
    projectId = polis.project(organizationId);
    secrets.secrets.set(`orgs/${organizationId}/llm/scripted`, {
      apiKey: 'sk-test',
    });
    tasks = actingAs(moduleRef.get(TasksService), caller());
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  const caller = () =>
    testPrincipal({
      sub: 'user-1',
      subType: 'user',
      organizationId,
      organizationRoles: ['owner'],
      scopes: [],
    });

  async function taskFor(
    sandboxRequired: boolean,
    acceptanceCriteria: {
      key: string;
      description: string;
      check: { type: 'command'; command: string };
    }[] = [],
  ) {
    const agents = actingAs(moduleRef.get(AgentsService), caller());
    const versions = actingAs(moduleRef.get(AgentVersionsService), caller());
    const agentId = (
      await agents.create(organizationId, { name: 'Shell', description: '' })
    ).id;
    const version = await versions.create(organizationId, agentId, {
      instructions: 'Use the shell.',
      model: { provider: 'scripted', model: 'scripted-model' },
      capabilities: ['code'],
      tools: [],
      skills: [],
      runtime: {
        provider: 'mastra',
        executionMode: 'standard',
        sandboxRequired,
      },
    });
    await versions.publish(organizationId, agentId, version.id);
    return (
      await tasks.create(
        organizationId,
        projectId,
        {
          title: 'Look around',
          instructions: 'Who are you in there?',
          agentId,
          serviceAccountId: SERVICE_ACCOUNT,
          acceptanceCriteria,
        },
        `key-${++key}`,
      )
    ).task;
  }

  const runner = () => moduleRef.get(TaskRunner);
  const workspaces = async () =>
    (await moduleRef
      .get(DataSource)
      .query(
        'SELECT execution_id, status, repository, sandbox, sandbox_reference, working_directory, destroyed_at FROM workspaces',
      )) as Record<string, unknown>[];
  const executionOf = async (taskId: string) =>
    (
      (await moduleRef
        .get(DataSource)
        .query('SELECT id FROM executions WHERE task_id = $1', [taskId])) as {
        id: string;
      }[]
    )[0].id;

  it('runs the agent with shell tools in its own sandbox, then destroys it', async () => {
    models.replies = [
      {
        toolCall: {
          tool: 'execute_command',
          input: { command: 'id -u && pwd && touch /etc/x 2>&1; true' },
        },
      },
      { text: 'I am uid 1000 in /workspace.' },
    ];
    const task = await taskFor(true);

    await runner().tick();
    await runner().drain();

    await expect(
      tasks.findById(organizationId, projectId, task.id),
    ).resolves.toMatchObject({ status: 'succeeded' });
    // The command ran in the sandbox; its output went back to the model.
    const toolResult = JSON.stringify(models.calls[1].prompt.at(-1));
    expect(toolResult).toContain('1000\\n/workspace\\n');
    expect(toolResult).toContain('Read-only file system');

    const executionId = await executionOf(task.id);
    expect(await workspaces()).toEqual([
      expect.objectContaining({
        execution_id: executionId,
        status: 'destroyed',
        repository: null,
        sandbox: {
          provider: 'docker',
          image: 'alpine:3.20',
          cpuLimit: 0.5,
          memoryLimitMb: 256,
          networkAccess: 'none',
        },
        sandbox_reference: null,
        working_directory: '/workspace',
        destroyed_at: expect.any(Date),
      }),
    ]);
    expect(await sandboxContainers(executionId)).toEqual([]);
  });

  it('checks command criteria in the sandbox, after the agent worked in it', async () => {
    models.replies = [
      {
        toolCall: {
          tool: 'execute_command',
          input: { command: 'echo done > /workspace/result.txt' },
        },
      },
      { text: 'Wrote the result.' },
    ];
    const task = await taskFor(true, [
      {
        key: 'result-written',
        description: 'The result is in /workspace/result.txt',
        check: {
          type: 'command',
          command: 'grep -q done /workspace/result.txt',
        },
      },
    ]);

    await runner().tick();
    await runner().drain();

    await expect(
      tasks.findById(organizationId, projectId, task.id),
    ).resolves.toMatchObject({ status: 'succeeded' });
    const [verification] = (await moduleRef
      .get(DataSource)
      .query(
        `SELECT body FROM artifacts WHERE task_id = $1 AND kind = 'verification'`,
        [task.id],
      )) as { body: { results: unknown[] } }[];
    expect(verification.body.results).toEqual([
      { key: 'result-written', outcome: 'passed', output: '' },
    ]);
  });

  it('tears the sandbox down when the task is cancelled mid-command', async () => {
    models.replies = [
      { toolCall: { tool: 'execute_command', input: { command: 'sleep 60' } } },
    ];
    const task = await taskFor(true);

    await runner().tick();
    // Until the command runs in the sandbox.
    for (let i = 0; i < 200 && models.calls.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const executionId = await executionOf(task.id);
    expect(await sandboxContainers(executionId)).toHaveLength(1);

    await tasks.cancel(organizationId, projectId, task.id);
    await runner().heartbeat();
    await runner().drain();

    expect(await sandboxContainers(executionId)).toEqual([]);
    expect(await workspaces()).toEqual([
      expect.objectContaining({ status: 'destroyed' }),
    ]);
  });

  it('gives an agent version without a sandbox neither a workspace nor shell tools', async () => {
    models.replies = [{ text: 'No shell needed.' }];
    const task = await taskFor(false);

    await runner().tick();
    await runner().drain();

    await expect(
      tasks.findById(organizationId, projectId, task.id),
    ).resolves.toMatchObject({ status: 'succeeded' });
    // Only its own tool for recording artifacts.
    expect((models.calls[0].tools ?? []).map((tool) => tool.name)).toEqual([
      'submit_artifact',
    ]);
    expect(await workspaces()).toEqual([]);
  });
});
