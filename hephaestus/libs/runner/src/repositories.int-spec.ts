import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { TestingModule } from '@nestjs/testing';
import Docker from 'dockerode';

import { actingAs, testPrincipal } from '@aether-os/krepis/testing';
import { ArtifactsService } from '@hephaestus/artifacts';
import { TasksService, type TaskResponse } from '@hephaestus/tasks';
import { EventInbox } from '@hephaestus/core';
import { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { WorkspacesService } from '@hephaestus/workspaces';

import type { FakePolis } from '../../../test/fake-polis.js';
import {
  FakeAgentRuntime,
  FakeTaskTokens,
  testRunnerOptions,
} from '../../../test/fake-runner.js';
import { createTestingModuleWith } from '../../../test/testing-module.js';
import { AgentRuntime, type AgentRunInput } from './agent-runtime.js';
import { ExecutionHistory } from './execution-history.js';
import {
  RepositoryTokens,
  type RepositoryCredentials,
} from './repository-tokens.js';
import {
  PullRequests,
  type OpenedPullRequest,
  type PullRequestRequest,
} from './pull-requests.js';
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
import { publishedAgent } from '../../../test/agora.js';

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
  allowedHosts: [],
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
      apiUrl: 'https://api.github.test',
      committer: {
        name: 'aether-os-test[bot]',
        email: '4242+aether-os-test[bot]@users.noreply.github.com',
      },
    });
  }
}

/** GitHub's pull requests, as Hephaestus opens them. */
class FakePullRequests extends PullRequests {
  readonly opened: PullRequestRequest[] = [];
  fail: RunnerFailure[] = [];

  open(request: PullRequestRequest): Promise<OpenedPullRequest> {
    this.opened.push(request);
    const failure = this.fail.shift();
    if (failure) return Promise.reject(failure);
    return Promise.resolve({
      number: 41 + this.opened.length,
      url: `https://github.test/${request.repository}/pull/${41 + this.opened.length}`,
      state: 'open',
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
  let pullRequests: FakePullRequests;
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
    pullRequests = new FakePullRequests();
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
          .useValue(repositoryTokens)
          .overrideProvider(PullRequests)
          .useValue(pullRequests),
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
      review?: string[];
    } = {},
  ) {
    const published = await publishedAgent(moduleRef, organizationId, {
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
    const agentId = published.agentId;
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
          review: { artifactKinds: options.review ?? [] },
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
  const artifacts = async (taskId: string) =>
    (
      await moduleRef
        .get(ArtifactsService)
        .list(organizationId, projectId, taskId, { limit: 100 })
    ).items;
  const execution = async (taskId: string) =>
    (
      await moduleRef
        .get(ExecutionHistory)
        .list(organizationId, projectId, taskId, { limit: 10 })
    ).items[0];
  const executionsOf = async (taskId: string) =>
    (
      await moduleRef
        .get(ExecutionHistory)
        .list(organizationId, projectId, taskId, { limit: 10 })
    ).items;
  /** Why the task moved, from its `task.status-changed` events in the outbox. */
  const statusReasons = async (taskId: string) =>
    (
      (await moduleRef
        .get(DataSource)
        .query(
          `SELECT message->'payload'->>'reason' AS reason FROM outbox WHERE routing_key = 'task.status-changed' AND message->>'aggregateId' = $1 ORDER BY created_at`,
          [taskId],
        )) as { reason: string }[]
    ).map((row) => row.reason);

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

    // Done, with a pull request to open: the next round delivers it.
    await expect(task(created.id)).resolves.toMatchObject({
      status: 'delivering',
    });
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
    // Read to check out, write to push and to deliver, all for the task's own token.
    expect(repositoryTokens.issued).toEqual(
      ['read', 'write', 'write'].map((access) => ({
        taskId: created.id,
        taskToken: `task-token-for-${created.id}`,
        access,
      })),
    );

    const { repository } = await execution(created.id);
    expect(repository).toEqual({
      linkId: LINK,
      fullName: 'acme/api',
      branch: `aether/${created.topLevelTaskId}`,
      baseSha: mainSha,
      headSha: expect.stringMatching(/^[0-9a-f]{40}$/),
      commits: 1,
      uncommittedChanges: true,
      // Nothing else on the branch: pushed as committed.
      pushedSha: repository!.headSha,
    });
    expect(repository!.headSha).not.toBe(mainSha);

    // On "GitHub": the task tree's branch, at the pushed commit, on main.
    expect(git(origin, 'rev-parse', `aether/${created.topLevelTaskId}`)).toBe(
      repository!.pushedSha,
    );
    expect(git(origin, 'rev-parse', `aether/${created.topLevelTaskId}~1`)).toBe(
      mainSha,
    );
    expect(git(origin, 'rev-parse', 'main')).toBe(mainSha);

    // The outcome is a pull request to be.
    const pullRequest = (await artifacts(created.id)).find(
      (a) => a.kind === 'pull_request',
    );
    expect(pullRequest).toMatchObject({
      kind: 'pull_request',
      status: 'final',
      primary: true,
      title: 'Add a changelog',
      linkId: LINK,
      repository: 'acme/api',
      branch: `aether/${created.topLevelTaskId}`,
      baseBranch: 'main',
      headSha: repository!.pushedSha,
      description: `Added CHANGELOG.md.\n\n---\nAether-Task: ${created.id}`,
      pullRequest: {
        number: 42,
        url: 'https://github.test/acme/api/pull/42',
        state: 'open',
      },
    });
    // Opened with a write token, on GitHub's API for the repository.
    expect(pullRequests.opened).toEqual([
      {
        apiUrl: 'https://api.github.test',
        token: 'ghs_not-needed-for-file-urls',
        repository: 'acme/api',
        branch: `aether/${created.topLevelTaskId}`,
        baseBranch: 'main',
        title: 'Add a changelog',
        body: `Added CHANGELOG.md.\n\n---\nAether-Task: ${created.id}`,
      },
    ]);
    await expect(task(created.id)).resolves.toMatchObject({
      primaryArtifactId: pullRequest!.id,
    });
  });

  it('rebases onto a branch that moved meanwhile, never forcing', async () => {
    let sibling = '';
    runtime.behaviour = async (input) => {
      await shell(
        input,
        'cd /workspace/repo && echo mine > mine.txt && git add . && git commit -q -m "Mine"',
      );
      // A sibling subtask pushes to the tree's branch while this one runs.
      const seed = join(root, 'seed');
      git(seed, 'checkout', '--quiet', '-B', input.repository!.branch, 'main');
      writeFileSync(join(seed, 'theirs.txt'), 'theirs\n');
      git(seed, 'add', '.');
      git(seed, 'commit', '--quiet', '-m', 'Theirs');
      git(
        seed,
        'push',
        '--quiet',
        'origin',
        `HEAD:${input.repository!.branch}`,
      );
      sibling = git(seed, 'rev-parse', 'HEAD');
      return { outcome: 'completed', summary: 'Mine.' };
    };
    const created = await taskFor();

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'delivering',
    });
    const { repository } = await execution(created.id);
    const branch = `aether/${created.topLevelTaskId}`;
    // Rebased: a new commit on top of the sibling's, linear history.
    expect(repository!.pushedSha).not.toBe(repository!.headSha);
    expect(git(origin, 'rev-parse', branch)).toBe(repository!.pushedSha);
    expect(git(origin, 'rev-parse', `${branch}~1`)).toBe(sibling);
    expect(git(origin, 'log', '--format=%s', branch)).toBe(
      'Mine\nTheirs\nInitial commit',
    );
    expect(
      git(
        origin,
        'log',
        '-1',
        '--format=%cn <%ce>%n%(trailers:key=Aether-Task,valueonly)',
        branch,
      ),
    ).toBe(
      `aether-os-test[bot] <4242+aether-os-test[bot]@users.noreply.github.com>\n${created.id}`,
    );
  });

  /** The agent commits README.md while a sibling pushes another README.md. */
  const conflictingSibling = async (input: AgentRunInput) => {
    await shell(
      input,
      'cd /workspace/repo && echo mine > README.md && git commit -qam "Mine"',
    );
    const seed = join(root, 'seed');
    git(seed, 'checkout', '--quiet', '-B', input.repository!.branch, 'main');
    writeFileSync(join(seed, 'README.md'), 'theirs\n');
    git(seed, 'commit', '--quiet', '-am', 'Theirs');
    git(seed, 'push', '--quiet', 'origin', `HEAD:${input.repository!.branch}`);
  };

  it('gives a conflict with the moved branch back to the agent, then pushes', async () => {
    runtime.behaviour = async (input) => {
      if (!input.conflict) {
        await conflictingSibling(input);
        return { outcome: 'completed', summary: 'Mine.' };
      }
      // Resolves it in the sandbox: both lines, then finishes the rebase.
      await shell(
        input,
        'cd /workspace/repo && printf "theirs\\nmine\\n" > README.md && git add README.md && GIT_EDITOR=true git rebase --continue',
      );
      return { outcome: 'completed', summary: 'Mine, after theirs.' };
    };
    const created = await taskFor();

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'delivering',
      attempt: 1,
    });
    const branch = `aether/${created.topLevelTaskId}`;
    expect(runtime.runs).toHaveLength(2);
    expect(runtime.runs[1].conflict).toEqual({ branch, files: ['README.md'] });
    // One execution: its second round resolved it, on top of the sibling's commit.
    expect(await executionsOf(created.id)).toHaveLength(1);
    expect(git(origin, 'log', '--format=%s', branch)).toBe(
      'Mine\nTheirs\nInitial commit',
    );
    expect(git(origin, 'show', `${branch}:README.md`)).toBe('theirs\nmine');
    const { repository } = await execution(created.id);
    expect(repository).toMatchObject({
      baseSha: git(origin, 'rev-parse', `${branch}~1`),
      pushedSha: git(origin, 'rev-parse', branch),
      commits: 1,
    });
    const [pullRequest] = (await artifacts(created.id)).filter(
      (artifact) => artifact.kind === 'pull_request',
    );
    expect(pullRequest).toMatchObject({
      status: 'final',
      headSha: repository!.pushedSha,
    });
    expect(await statusReasons(created.id)).toContain('branch-conflict');
  });

  it('fails an execution that leaves the rebase unfinished', async () => {
    runtime.behaviour = async (input) => {
      if (!input.conflict) await conflictingSibling(input);
      return { outcome: 'completed', summary: 'Mine.' };
    };
    const created = await taskFor();

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'agent_failed',
    });
    expect((await execution(created.id)).error).toMatch(
      /left the rebase onto aether\/.* unfinished/,
    );
  });

  it('runs the task again from the new head once its rounds are used up', async () => {
    // Every round conflicts again: a sibling keeps pushing to README.md.
    runtime.behaviour = async (input) => {
      if (input.conflict) {
        await shell(
          input,
          'cd /workspace/repo && echo resolved > README.md && git add README.md && GIT_EDITOR=true git rebase --continue',
        );
        const seed = join(root, 'seed');
        git(seed, 'fetch', '--quiet', 'origin');
        git(
          seed,
          'checkout',
          '--quiet',
          '-B',
          input.repository!.branch,
          `origin/${input.repository!.branch}`,
        );
        writeFileSync(
          join(seed, 'README.md'),
          `theirs again ${runtime.runs.length}\n`,
        );
        git(seed, 'commit', '--quiet', '-am', 'Theirs again');
        git(
          seed,
          'push',
          '--quiet',
          'origin',
          `HEAD:${input.repository!.branch}`,
        );
      } else {
        await conflictingSibling(input);
      }
      return { outcome: 'completed', summary: 'Mine.' };
    };
    const created = await taskFor();

    await runOnce();

    // VERIFICATION_MAX_ROUNDS (3) runs, then retried (infrastructure) from the branch's head.
    expect(runtime.runs).toHaveLength(3);
    await expect(task(created.id)).resolves.toMatchObject({
      status: 'queued',
      attempt: 1,
    });
    expect((await execution(created.id)).error).toMatch(
      /still conflict with aether\/.* after 3 rounds; the task runs again from its head/,
    );
    expect(
      (await artifacts(created.id)).filter((a) => a.kind === 'pull_request'),
    ).toEqual([]);
  });

  it('never pushes changes to CI workflows', async () => {
    runtime.behaviour = async (input) => {
      await shell(
        input,
        'cd /workspace/repo && mkdir -p .github/workflows && echo "on: push" > .github/workflows/ci.yml && git add . && git commit -q -m "CI"',
      );
      return { outcome: 'completed', summary: 'Added CI.' };
    };
    const created = await taskFor();

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'agent_failed',
    });
    expect((await execution(created.id)).error).toMatch(
      /change CI workflows \(\.github\/workflows\/ci\.yml\)/,
    );
    expect(git(origin, 'branch', '--list', 'aether/*')).toBe('');
  });

  it('puts the pull request up for review when it needs approval', async () => {
    runtime.behaviour = async (input) => {
      await shell(
        input,
        'cd /workspace/repo && echo x > x.txt && git add . && git commit -q -m "X"',
      );
      return { outcome: 'completed', summary: 'X.' };
    };
    const created = await taskFor({ review: ['pull_request'] });

    await runOnce();

    await expect(task(created.id)).resolves.toMatchObject({
      status: 'awaiting_review',
    });
    const drafts = (await artifacts(created.id)).filter(
      (a) => a.status === 'draft',
    );
    expect(drafts.map((a) => [a.kind, a.primary])).toEqual([
      ['pull_request', true],
    ]);
    // Pushed already: the draft is the branch at its head.
    expect(git(origin, 'rev-parse', `aether/${created.topLevelTaskId}`)).toBe(
      (drafts[0] as { headSha: string }).headSha,
    );
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
      `aether-os-test[bot] <4242+aether-os-test[bot]@users.noreply.github.com>\nAdd a\n\nAether-Task: ${created.id}`,
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

  /** A task that commits one file, run until it's delivering. */
  async function committed() {
    runtime.behaviour = async (input) => {
      await shell(
        input,
        'cd /workspace/repo && echo y > y.txt && git add . && git commit -q -m "Y"',
      );
      return { outcome: 'completed', summary: 'Y.' };
    };
    const created = await taskFor();
    await runOnce();
    await expect(task(created.id)).resolves.toMatchObject({
      status: 'delivering',
    });
    return created;
  }
  const branchExists = (name: string) =>
    git(origin, 'branch', '--list', name) !== '';

  it('retries a delivery that failed, and fails the task when it keeps failing', async () => {
    const created = await committed();
    pullRequests.fail = [
      new RunnerFailure('GitHub could not be reached', 'infrastructure'),
    ];

    // Tried again after its backoff (none in tests: in the same round).
    await runOnce();
    await expect(task(created.id)).resolves.toMatchObject({
      status: 'succeeded',
    });
    expect(pullRequests.opened).toHaveLength(2);

    // Refused access isn't retried: the task fails, and its branch goes.
    const refused = await committed();
    expect(branchExists(`aether/${refused.id}`)).toBe(true);
    pullRequests.fail = [
      new RunnerFailure(
        'GitHub refused opening the pull request (403)',
        'access_denied',
      ),
    ];
    await runOnce();
    await expect(task(refused.id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'infrastructure',
    });
    await runOnce();
    expect(branchExists(`aether/${refused.id}`)).toBe(false);
  });

  it("follows the pull request's state, and deletes the branch once it's merged", async () => {
    const created = await committed();
    await runOnce();
    const branch = `aether/${created.topLevelTaskId}`;
    const event = (state: 'open' | 'merged' | 'closed', version: number) =>
      moduleRef.get(EventInbox).receive('proxenos', {
        eventId: uuidv7(),
        eventType: 'git.pull-request.updated',
        schemaVersion: 1,
        aggregateId: '0193a1b2-c3d4-7e5f-8a9b-0000000077aa',
        aggregateVersion: version,
        occurredAt: new Date(),
        organizationId,
        projectId: null,
        actor: null,
        payload: {
          repositoryId: '0193a1b2-c3d4-7e5f-8a9b-0000000077bb',
          repository: 'acme/api',
          number: 42,
          url: 'https://github.test/acme/api/pull/42',
          state,
          branch,
          baseBranch: 'main',
          headSha: 'abc',
          mergedAt: state === 'merged' ? new Date().toISOString() : null,
          fromAetherOs: false,
        },
      });

    await event('open', 1);
    await runOnce();
    expect(branchExists(branch)).toBe(true);

    await event('merged', 2);
    const pullRequest = (await artifacts(created.id)).find(
      (a) => a.kind === 'pull_request',
    );
    expect(pullRequest).toMatchObject({
      pullRequest: { number: 42, state: 'merged' },
    });
    await runOnce();
    expect(branchExists(branch)).toBe(false);
    // The repository's own branches are left alone.
    expect(git(origin, 'rev-parse', 'main')).toBe(mainSha);
  });

  it("deletes a cancelled tree's branch", async () => {
    runtime.behaviour = async (input) => {
      await shell(
        input,
        'cd /workspace/repo && echo z > z.txt && git add . && git commit -q -m "Z"',
      );
      return { outcome: 'completed', summary: 'Z.' };
    };
    const created = await taskFor({ review: ['pull_request'] });
    await runOnce();
    await expect(task(created.id)).resolves.toMatchObject({
      status: 'awaiting_review',
    });
    expect(branchExists(`aether/${created.id}`)).toBe(true);

    await tasks.cancel(organizationId, projectId, created.id);
    await runOnce();

    expect(branchExists(`aether/${created.id}`)).toBe(false);
    expect(pullRequests.opened).toEqual([]);
  });
});
