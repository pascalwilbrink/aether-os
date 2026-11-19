import type { TestingModule } from '@nestjs/testing';
import Docker from 'dockerode';
import { DataSource } from 'typeorm';

import { actingAs, testPrincipal } from '@aether-os/krepis/testing';
import { AgentsService, AgentVersionsService } from '@hephaestus/agents';
import { SecretStore } from '@hephaestus/core';
import {
  LanguageModels,
  BudgetsService,
  ModelGateway,
} from '@hephaestus/models';
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
  allowedHosts: [],
  lifetimeMs: 600_000,
};

const noNetwork = { access: 'none' as const };

/** For proxies and the test's upstream: Docker Hub's mirror, which doesn't rate-limit CI. */
const NODE_IMAGE = 'mirror.gcr.io/library/node:22-alpine';

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

async function pull(image: string): Promise<void> {
  try {
    await docker.getImage(image).inspect();
    return;
  } catch {
    // Not there yet.
  }
  const stream = await docker.pull(image);
  await new Promise<void>((resolve, reject) =>
    docker.modem.followProgress(stream, (error) =>
      error ? reject(error) : resolve(),
    ),
  );
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
      network: noNetwork,
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

  it('runs commands with bytes in and out, as the sandbox user', async () => {
    const spec = {
      sandboxId,
      ...sandboxOptions,
      workingDirectory: '/workspace',
      labels: { 'aether-os.execution-id': sandboxId },
      network: noNetwork,
    };
    await driver.create(spec, new AbortController().signal);
    try {
      // Every byte value survives the trip (bundles are binary).
      const bytes = Buffer.from(
        Array.from({ length: 70_000 }, (_, i) => i % 256),
      );
      const written = await driver.exec(
        sandboxId,
        ['sh', '-c', 'cat > /workspace/blob && id -u'],
        {
          stdin: bytes,
        },
      );
      expect(written).toMatchObject({ exitCode: 0 });
      expect(written.stdout.toString().trim()).toBe('1000');
      const read = await driver.exec(sandboxId, ['cat', 'blob'], {
        workingDirectory: '/workspace',
      });
      expect(read.stdout.equals(bytes)).toBe(true);

      // The working directory runs scripts (hooks, a repository's own); /tmp doesn't.
      const scripts = await driver.exec(sandboxId, [
        'sh',
        '-c',
        'for d in /workspace /tmp; do printf "#!/bin/sh\\necho ran" > $d/s; chmod +x $d/s; $d/s 2>&1 || echo refused; done',
      ]);
      expect(scripts.stdout.toString()).toMatch(
        /^ran\n.*(Permission denied|refused)/s,
      );

      const failing = await driver.exec(sandboxId, [
        'sh',
        '-c',
        'echo oops >&2; exit 3',
      ]);
      expect(failing).toMatchObject({ exitCode: 3, stderr: 'oops\n' });
    } finally {
      await driver.remove(sandboxId);
    }
  });

  it('reaches only allowed hosts, through its own proxy, and records the rest', async () => {
    const egress = `aether-test-egress-${Date.now()}`;
    await pull(NODE_IMAGE);
    await docker.createNetwork({ Name: egress, Driver: 'bridge' });
    // A stand-in for a package registry, reachable only on the egress network.
    const upstream = await docker.createContainer({
      name: `${egress}-upstream`,
      Image: NODE_IMAGE,
      Cmd: [
        'node',
        '-e',
        "require('http').createServer((q, r) => r.end('registry ok')).listen(80)",
      ],
      HostConfig: { NetworkMode: egress },
      NetworkingConfig: {
        EndpointsConfig: { [egress]: { Aliases: ['registry.test'] } },
      },
    });
    await upstream.start();
    const restricted = new DockerSandboxDriver(docker, {
      proxyImage: NODE_IMAGE,
      egressNetwork: egress,
      // The stand-in's address is a private one.
      blockPrivateAddresses: false,
    });
    const id = '0193a1b2-c3d4-7e5f-8a9b-00000000d0c9';
    try {
      const created = await restricted.create(
        {
          sandboxId: id,
          ...sandboxOptions,
          workingDirectory: '/workspace',
          labels: { 'aether-os.execution-id': id },
          network: { access: 'restricted', allowedHosts: ['registry.test'] },
        },
        new AbortController().signal,
      );
      const info = await docker.getContainer(created.resourceId).inspect();
      expect(info.HostConfig.NetworkMode).toBe(`aether-sandbox-net-${id}`);
      expect(info.Config.Env).toContain('HTTPS_PROXY=http://proxy:3128');
      const proxy = await docker
        .getContainer(`aether-sandbox-proxy-${id}`)
        .inspect();
      expect(proxy.Config.User).toBe('1000:1000');
      expect(proxy.HostConfig).toMatchObject({
        ReadonlyRootfs: true,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges:true'],
      });

      // Through the proxy (wget reads http_proxy) to the allowed host.
      let reached = '';
      for (let i = 0; i < 50 && !reached.includes('registry ok'); i++) {
        reached = (
          await restricted.exec(id, [
            'wget',
            '-q',
            '-O',
            '-',
            'http://registry.test/pkg',
          ])
        ).stdout.toString();
        if (!reached) await new Promise((r) => setTimeout(r, 200));
      }
      expect(reached).toBe('registry ok');

      // Anything else is refused by the proxy, and there's no way around it.
      const refused = await restricted.exec(id, [
        'wget',
        '-q',
        '-O',
        '-',
        'http://example.com/',
      ]);
      expect(refused.exitCode).not.toBe(0);
      expect(refused.stderr).toContain('403');
      const direct = await restricted.exec(id, [
        'wget',
        '-q',
        '-T',
        '2',
        '-Y',
        'off',
        '-O',
        '-',
        'http://registry.test/pkg',
      ]);
      expect(direct.exitCode).not.toBe(0);

      expect(await restricted.blockedHosts(id)).toEqual(['example.com']);
    } finally {
      await restricted.remove(id);
      await upstream.remove({ force: true });
      await docker.getNetwork(egress).remove();
    }
    // The proxy and the sandbox's network went with it.
    await expect(
      docker.getContainer(`aether-sandbox-proxy-${id}`).inspect(),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      docker.getNetwork(`aether-sandbox-net-${id}`).inspect(),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await restricted.blockedHosts(id)).toEqual([]);
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
          network: noNetwork,
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
            factory: (gateway: ModelGateway, budgets: BudgetsService) =>
              new MastraAgentRuntime(gateway, budgets),
            inject: [ModelGateway, BudgetsService],
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
    sandboxRequired: boolean | Record<string, unknown>,
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
        ...(typeof sandboxRequired === 'boolean'
          ? { sandboxRequired }
          : { sandboxRequired: true, ...sandboxRequired }),
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
        'SELECT execution_id, status, repository, sandbox, sandbox_reference, working_directory, blocked_hosts, destroyed_at FROM workspaces',
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

  it('gives a restricted agent a proxy, and records the hosts it was refused', async () => {
    models.replies = [
      {
        toolCall: {
          tool: 'execute_command',
          input: { command: 'wget -q -O - http://example.com/ 2>&1; true' },
        },
      },
      { text: 'Blocked.' },
    ];
    const task = await taskFor({
      networkAccess: 'restricted',
      allowedHosts: ['*.internal.test'],
    });

    await runner().tick();
    await runner().drain();

    await expect(
      tasks.findById(organizationId, projectId, task.id),
    ).resolves.toMatchObject({ status: 'succeeded' });
    expect(JSON.stringify(models.calls[1].prompt.at(-1))).toContain('403');
    expect(await workspaces()).toEqual([
      expect.objectContaining({
        status: 'destroyed',
        sandbox: expect.objectContaining({
          networkAccess: 'restricted',
          // The platform's (none in this test) and the version's.
          allowedHosts: ['*.internal.test'],
        }),
        blocked_hosts: ['example.com'],
      }),
    ]);
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
