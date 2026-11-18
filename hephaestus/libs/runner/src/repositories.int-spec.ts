import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { TestingModule } from '@nestjs/testing';
import Docker from 'dockerode';

import { actingAs, testPrincipal } from '@aether-os/krepis/testing';
import { AgentsService, AgentVersionsService } from '@hephaestus/agents';
import { TasksService, type TaskResponse } from '@hephaestus/tasks';
import { WorkspacesService } from '@hephaestus/workspaces';

import type { FakePolis } from '../../../test/fake-polis.js';
import {
  FakeAgentRuntime,
  FakeTaskTokens,
  testRunnerOptions,
} from '../../../test/fake-runner.js';
import { createTestingModuleWith } from '../../../test/testing-module.js';
import { AgentRuntime, type AgentRunInput } from './agent-runtime.js';
import { ExecutionsService } from './executions.service.js';
import {
  RepositoryTokens,
  type RepositoryCredentials,
} from './repository-tokens.js';
import { RunnerModule } from './runner.module.js';
import { RUNNER_OPTIONS } from './runner.options.js';
import { RunnerFailure } from './runner.errors.js';
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
const LINK = '0193a1b2-c3d4-7e5f-8a9b-0000000011aa';
const docker = new Docker();

/** A shell and git, small and quick to pull. */
const sandboxOptions: SandboxOptions = {
  image: 'alpine/git:v2.47.2',
  user: '1000:1000',
  cpus: 0.5,
  memoryMb: 256,
  pidsLimit: 64,
  workspaceMb: 64,
  lifetimeMs: 600_000,
};

/** Proxenos, for a repository on this disk: no token needed for `file://`. */
class FakeRepositoryTokens extends RepositoryTokens {
  readonly issued: { taskId: string; taskToken: string; access: string }[] = [];
  refuse: RunnerFailure | undefined;

  constructor(private readonly origin: () => string) {
    super();
  }

  issue(
    task: TaskResponse,
    taskToken: string,
    access: 'read' | 'write',
  ): Promise<RepositoryCredentials> {
    this.issued.push({ taskId: task.id, taskToken, access });
    if (this.refuse) return Promise.reject(this.refuse);
    return Promise.resolve({
      token: 'ghs_not-needed-for-file-urls',
      fullName: 'acme/api',
      cloneUrl: `file://${this.origin()}`,
      defaultBranch: 'main',
    });
  }
}

/** Git as a person would run it on the "GitHub" side. */
const git = (cwd: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=Ada', '-c', 'user.email=ada@example.com', ...args],
    {
      cwd,
      env: {
        PATH: process.env.PATH,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
      },
    },
  )
    .toString('utf8')
    .trim();

afterAll(async () => {
  for (const container of await docker.listContainers({
    all: true,
    filters: { label: ['aether-os.sandbox=true'] },
  })) {
    await docker.getContainer(container.Id).remove({ force: true });
  }
});

vi.setConfig({ testTimeout: 90_000 });

describe('Repositories in sandboxes (Docker, Postgres)', () => {
  let moduleRef: TestingModule;
  let polis: FakePolis;
  let runtime: FakeAgentRuntime;
  let repositoryTokens: FakeRepositoryTokens;
  let organizationId: string;
  let projectId: string;
  let tasks: TasksService;
  let root: string;
  let origin: string;
  let mainSha: string;
  let key = 0;

  beforeEach(async () => {
    // "GitHub": a bare repository with one commit on main.
    root = mkdtempSync(join(tmpdir(), 'aether-origin-'));
    origin = join(root, 'origin.git');
    const seed = join(root, 'seed');
    git(root, 'init', '--quiet', '--bare', '--initial-branch=main', origin);
    git(root, 'clone', '--quiet', origin, seed);
    writeFileSync(join(seed, 'README.md'), '# api\n');
    git(seed, 'add', '.');
    git(seed, 'commit', '--quiet', '-m', 'Initial commit');
    git(seed, 'push', '--quiet', 'origin', 'HEAD:main');
    mainSha = git(seed, 'rev-parse', 'HEAD');

    runtime = new FakeAgentRuntime();
    repositoryTokens = new FakeRepositoryTokens(() => origin);
    ({ moduleRef, polis } = await createTestingModuleWith(
      (builder) =>
        builder
          .overrideProvider(RUNNER_OPTIONS)
          .useValue(testRunnerOptions({ maxExecutions: 1 }))
          .overrideProvider(AgentRuntime)
          .useValue(runtime)
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
          .overrideProvider(TaskTokens)
          .useValue(new FakeTaskTokens())
          .overrideProvider(RepositoryTokens)
          .useValue(repositoryTokens),
      RunnerModule,
    ));
    organizationId = polis.organization();
    projectId = polis.project(organizationId);
    tasks = actingAs(moduleRef.get(TasksService), owner());
  });

  afterEach(async () => {
    await moduleRef.close();
    rmSync(root, { recursive: true, force: true });
  });

  const owner = () =>
    testPrincipal({
      sub: 'user-1',
      subType: 'user',
      organizationId,
      organizationRoles: ['owner'],
      scopes: [],
    });

  async function taskFor(
    options: {
      sandboxRequired?: boolean;
      repository?: boolean;
      parentTaskId?: string;
    } = {},
  ) {
    const agents = actingAs(moduleRef.get(AgentsService), owner());
    const versions = actingAs(moduleRef.get(AgentVersionsService), owner());
    const agentId = (
      await agents.create(organizationId, { name: 'Coder', description: '' })
    ).id;
    const version = await versions.create(organizationId, agentId, {
      instructions: 'Change the code.',
      model: { provider: 'scripted', model: 'scripted-model' },
      capabilities: ['code'],
      tools: [],
      skills: [],
      runtime: {
        provider: 'mastra',
        executionMode: 'coding',
        sandboxRequired: options.sandboxRequired ?? true,
      },
    });
    await versions.publish(organizationId, agentId, version.id);
    return (
      await tasks.create(
        organizationId,
        projectId,
        {
          title: 'Add a changelog',
          instructions: 'Start a CHANGELOG.md.',
          agentId,
          serviceAccountId: SERVICE_ACCOUNT,
          parentTaskId: options.parentTaskId,
          repository:
            options.repository === false ? undefined : { linkId: LINK },
        },
        `key-${++key}`,
      )
    ).task;
  }

  /** The agent, in its sandbox's shell, as its tools would run commands. */
  const shell = async (input: AgentRunInput, command: string) => {
    const result = await input.sandbox!.agentSandbox!.executeCommand!(command);
    if (result.exitCode !== 0) {
      throw new Error(`${command}: ${result.stderr}`);
    }
    return result.stdout.trim();
  };

  async function runOnce() {
    const runner = moduleRef.get(TaskRunner);
    await runner.tick();
    await runner.drain();
  }

  const task = (id: string) => tasks.findById(organizationId, projectId, id);
  const execution = async (taskId: string) =>
    (
      await moduleRef
        .get(ExecutionsService)
        .list(organizationId, projectId, taskId, { limit: 10 })
    ).items[0];

  it('checks the repository out in the sandbox, and takes the commits back out', async () => {
    let seen: Record<string, string> = {};
    runtime.behaviour = async (input) => {
      seen = {
        branch: await shell(
          input,
          'cd /workspace/repo && git rev-parse --abbrev-ref HEAD',
        ),
        head: await shell(input, 'cd /workspace/repo && git rev-parse HEAD'),
        remotes: await shell(input, 'cd /workspace/repo && git remote'),
        readme: await shell(input, 'cat /workspace/repo/README.md'),
        bundleGone: await shell(
          input,
          'test -e /tmp/aether-in.bundle && echo there || echo gone',
        ),
      };
      await shell(
        input,
        'cd /workspace/repo && echo "# Changelog" > CHANGELOG.md && git add . && git commit -q -m "Start a changelog" && echo scratch > notes.txt',
      );
      return { outcome: 'completed', summary: 'Added CHANGELOG.md.' };
    };
    const created = await taskFor();
    expect(created.repository).toEqual({ linkId: LINK });

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'succeeded',
    });
    // On the task tree's branch, from main, no remote, no token, the bundle removed.
    expect(seen).toEqual({
      branch: `aether/${created.topLevelTaskId}`,
      head: mainSha,
      remotes: '',
      readme: '# api',
      bundleGone: 'gone',
    });
    expect(runtime.runs[0].repository).toEqual({
      fullName: 'acme/api',
      path: '/workspace/repo',
      branch: `aether/${created.topLevelTaskId}`,
      startedFrom: 'main',
    });
    // A read token, asked for with the task's own token.
    expect(repositoryTokens.issued).toEqual([
      {
        taskId: created.id,
        taskToken: `task-token-for-${created.id}`,
        access: 'read',
      },
    ]);

    const { repository } = await execution(created.id);
    expect(repository).toEqual({
      linkId: LINK,
      fullName: 'acme/api',
      branch: `aether/${created.topLevelTaskId}`,
      baseSha: mainSha,
      headSha: expect.stringMatching(/^[0-9a-f]{40}$/),
      commits: 1,
      uncommittedChanges: true,
    });
    expect(repository!.headSha).not.toBe(mainSha);
  });

  it('commits as the Aether-os bot, naming the task', async () => {
    let commit = '';
    runtime.behaviour = async (input) => {
      await shell(
        input,
        'cd /workspace/repo && echo x > a.txt && git add . && git commit -q -m "Add a"',
      );
      commit = await shell(
        input,
        'cd /workspace/repo && git log -1 --format="%an <%ae>%n%B"',
      );
      return { outcome: 'completed', summary: 'Done.' };
    };
    const created = await taskFor();

    await runOnce();

    expect(commit).toBe(
      `Aether-os <aether-os@users.noreply.github.com>\nAdd a\n\nAether-Task: ${created.id}`,
    );
    await expect(execution(created.id)).resolves.toMatchObject({
      repository: { commits: 1, uncommittedChanges: false },
    });
  });

  it("starts from the task tree's branch when it exists, also for subtasks", async () => {
    const parent = await taskFor();
    // A dependency already pushed to the tree's branch.
    const seed = join(root, 'seed');
    git(seed, 'checkout', '--quiet', '-b', `aether/${parent.id}`);
    writeFileSync(join(seed, 'DONE.md'), 'earlier work\n');
    git(seed, 'add', '.');
    git(seed, 'commit', '--quiet', '-m', 'Earlier work');
    git(seed, 'push', '--quiet', 'origin', `aether/${parent.id}`);
    const branchSha = git(seed, 'rev-parse', 'HEAD');

    let files = '';
    runtime.behaviour = async (input) => {
      files = await shell(input, 'ls /workspace/repo');
      return { outcome: 'completed', summary: 'Looked.' };
    };
    const child = await taskFor({ parentTaskId: parent.id, repository: false });
    expect(child.repository).toEqual({ linkId: LINK });
    // Only the child runs (the parent waits on nothing, but run them in order).
    await runOnce();
    await runOnce();

    expect(files).toBe('DONE.md\nREADME.md');
    await expect(execution(child.id)).resolves.toMatchObject({
      repository: {
        branch: `aether/${parent.id}`,
        baseSha: branchSha,
        commits: 0,
        headSha: branchSha,
      },
    });
  });

  it('refuses rewritten history', async () => {
    runtime.behaviour = async (input) => {
      await shell(
        input,
        'cd /workspace/repo && git checkout -q --orphan fresh && git rm -rqf . && echo new > n.txt && git add . && git commit -q -m "New history"',
      );
      return { outcome: 'completed', summary: 'Rewrote.' };
    };
    const created = await taskFor();

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'agent_failed',
    });
    expect((await execution(created.id)).error).toMatch(
      /could not be taken out|don't build on main/,
    );
  });

  it('fails without retrying when the repository or the sandbox is missing', async () => {
    // No sandbox for this agent version.
    const noSandbox = await taskFor({ sandboxRequired: false });
    await runOnce();
    await expect(task(noSandbox.id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'infrastructure',
    });
    expect((await execution(noSandbox.id)).error).toMatch(
      /runs without a sandbox/,
    );

    // The link is gone (Proxenos says 404).
    repositoryTokens.refuse = new RunnerFailure(
      "The task's repository can't be used (not found)",
      'access_denied',
    );
    const gone = await taskFor();
    await runOnce();
    await expect(task(gone.id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'access_denied',
    });
    expect(runtime.runs).toHaveLength(0);
  });

  it('leaves tasks without a repository alone', async () => {
    runtime.behaviour = async (input) => {
      expect(input.repository).toBeNull();
      return { outcome: 'completed', summary: 'No repository.' };
    };
    const created = await taskFor({ repository: false });
    expect(created.repository).toBeNull();

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'succeeded',
    });
    expect((await execution(created.id)).repository).toBeNull();
    expect(repositoryTokens.issued).toEqual([]);
  });
});
