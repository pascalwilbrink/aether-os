import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';

import type { ApiTypes } from '@hephaestus/core';
import type { TaskResponse } from '@hephaestus/tasks';

import { GitClient, GitError } from './git-client.js';
import { RepositoryTokens } from './repository-tokens.js';
import { RunnerFailure } from './runner.errors.js';
import type { Sandbox } from './sandbox-provisioner.js';

/** Where the agent finds the repository in its sandbox. */
export const REPOSITORY_PATH = '/workspace/repo';
const BUNDLE_IN = '/tmp/aether-in.bundle';
const BUNDLE_OUT = '/tmp/aether-out.bundle';

/** Who commits in a sandbox (docs/git.md: the Aether-os bot identity). */
export const COMMITTER = {
  name: 'Aether-os',
  email: 'aether-os@users.noreply.github.com',
};

/** A repository checked out in an execution's sandbox. */
export interface Checkout {
  linkId: string;
  fullName: string;
  /** The task tree's branch, `aether/<top-level task ID>`. */
  branch: string;
  /** The branch it started from: the task branch, or the default branch. */
  startedFrom: string;
  baseSha: string;
  path: string;
  /** Hephaestus's own clone, where the commits come back to. */
  hostDirectory: string;
}

/** What the agent left in the repository. */
export type CollectedCommits = Pick<
  ApiTypes.ExecutionRepository,
  'headSha' | 'commits' | 'uncommittedChanges'
>;

/**
 * Repositories in sandboxes (docs/git.md, Inside the sandbox). The sandbox
 * has no network and never sees a token, so Hephaestus does the Git work
 * on its own side: it clones with a read token from Proxenos, from the task
 * tree's branch if it exists (the work of finished dependencies) or else
 * the default branch, and moves the repository in as a git bundle through
 * the sandbox's stdin. The agent commits there (as the Aether-os bot, every
 * commit with an `Aether-Task` trailer); afterwards the new commits come
 * out the same way, as a bundle checked against Hephaestus's clone.
 * Pushing them is the next step.
 */
@Injectable()
export class RepositoryCheckouts {
  private readonly logger = new Logger(RepositoryCheckouts.name);

  constructor(
    private readonly tokens: RepositoryTokens,
    private readonly git: GitClient,
  ) {}

  /** Checks out the task's repository in its sandbox, or null if it has none. */
  async checkout(
    task: TaskResponse,
    taskToken: string,
    sandbox: Sandbox | null,
  ): Promise<Checkout | null> {
    if (!task.repository) {
      return null;
    }
    const exec = sandbox?.exec;
    if (!exec) {
      throw new RunnerFailure(
        'The task works in a repository, and its agent version runs without a sandbox (runtime.sandboxRequired)',
        'infrastructure',
        false,
      );
    }
    const version = await exec(['git', '--version']).catch(() => null);
    if (version?.exitCode !== 0) {
      throw new RunnerFailure(
        "The sandbox image has no git (SANDBOX_IMAGE): it can't work in a repository",
        'infrastructure',
        false,
      );
    }

    const credentials = await this.tokens.issue(task, taskToken, 'read');
    const auth = { token: credentials.token };
    const branch = `aether/${task.topLevelTaskId}`;
    const hostRoot = await mkdtemp(join(tmpdir(), 'aether-repo-'));
    const hostDirectory = join(hostRoot, 'repo');
    try {
      const startedFrom = (await this.git.hasBranch(
        credentials.cloneUrl,
        branch,
        auth,
      ))
        ? branch
        : credentials.defaultBranch;
      await this.git.clone(
        credentials.cloneUrl,
        startedFrom,
        hostDirectory,
        auth,
      );
      const baseSha = await this.git.revParse(hostDirectory, 'HEAD');
      const bundle = join(hostRoot, 'in.bundle');
      await this.git.bundle(hostDirectory, bundle, ['HEAD', startedFrom]);

      await this.sandboxStep(
        exec,
        ['sh', '-c', 'cat > "$1"', 'sh', BUNDLE_IN],
        'copying the repository in',
        await readFile(bundle),
      );
      await this.sandboxStep(
        exec,
        [
          'sh',
          '-c',
          [
            'set -e',
            'git clone --quiet "$1" "$2"',
            'cd "$2"',
            'git checkout --quiet -B "$3"',
            'git remote remove origin',
            'git config user.name "$4"',
            'git config user.email "$5"',
            'rm -f "$1"',
          ].join('\n'),
          'sh',
          BUNDLE_IN,
          REPOSITORY_PATH,
          branch,
          COMMITTER.name,
          COMMITTER.email,
        ],
        'checking out the repository',
      );
      await this.sandboxStep(
        exec,
        [
          'sh',
          '-c',
          'cat > "$1" && chmod 755 "$1"',
          'sh',
          `${REPOSITORY_PATH}/.git/hooks/commit-msg`,
        ],
        'adding the commit hook',
        Buffer.from(commitHook(task.id)),
      );
      return {
        linkId: task.repository.linkId,
        fullName: credentials.fullName,
        branch,
        startedFrom,
        baseSha,
        path: REPOSITORY_PATH,
        hostDirectory,
      };
    } catch (error) {
      await rm(hostRoot, { recursive: true, force: true });
      if (error instanceof GitError) {
        // Cloning: the repository or GitHub can't be reached right now.
        throw new RunnerFailure(
          `The repository could not be cloned: ${error.message}`,
          'infrastructure',
        );
      }
      throw error;
    }
  }

  /**
   * What the agent committed on top of the base, taken out of the sandbox
   * as a bundle and fetched into Hephaestus's clone (`refs/aether/result`),
   * so it's known to apply there. Uncommitted changes are reported, not kept.
   */
  async collect(
    checkout: Checkout,
    sandbox: Sandbox,
  ): Promise<CollectedCommits> {
    const exec = sandbox.exec!;
    const status = await this.sandboxStep(
      exec,
      ['git', 'status', '--porcelain'],
      'reading the repository',
      undefined,
      checkout.path,
    );
    const uncommittedChanges = status.stdout.toString('utf8').trim().length > 0;
    const counted = await this.sandboxStep(
      exec,
      ['git', 'rev-list', '--count', `${checkout.baseSha}..HEAD`],
      'counting the commits',
      undefined,
      checkout.path,
    );
    const commits = Number(counted.stdout.toString('utf8').trim());
    if (commits === 0) {
      return { headSha: checkout.baseSha, commits: 0, uncommittedChanges };
    }

    await this.sandboxStep(
      exec,
      [
        'git',
        'bundle',
        'create',
        '--quiet',
        BUNDLE_OUT,
        `${checkout.baseSha}..HEAD`,
      ],
      'bundling the commits',
      undefined,
      checkout.path,
    );
    const bundle = await this.sandboxStep(
      exec,
      ['cat', BUNDLE_OUT],
      'copying the commits out',
    );
    const file = join(checkout.hostDirectory, '..', 'out.bundle');
    await writeFile(file, bundle.stdout);
    let headSha: string;
    try {
      headSha = await this.git.fetchBundle(
        checkout.hostDirectory,
        file,
        'refs/aether/result',
      );
    } catch (error) {
      throw new RunnerFailure(
        `The agent's commits could not be taken out of the sandbox: ${error instanceof Error ? error.message : String(error)}`,
        'agent_failed',
      );
    }
    if (
      !(await this.git.isAncestor(
        checkout.hostDirectory,
        checkout.baseSha,
        headSha,
      ))
    ) {
      throw new RunnerFailure(
        `The agent's commits don't build on ${checkout.startedFrom} (${checkout.baseSha.slice(0, 12)}): history was rewritten`,
        'agent_failed',
      );
    }
    return { headSha, commits, uncommittedChanges };
  }

  /** Removes Hephaestus's clone. */
  async cleanup(checkout: Checkout): Promise<void> {
    await rm(join(checkout.hostDirectory, '..'), {
      recursive: true,
      force: true,
    }).catch((error: unknown) =>
      this.logger.warn(
        `Removing ${checkout.hostDirectory} failed: ${String(error)}`,
      ),
    );
  }

  private async sandboxStep(
    exec: NonNullable<Sandbox['exec']>,
    command: string[],
    what: string,
    stdin?: Buffer,
    workingDirectory?: string,
  ) {
    const result = await exec(command, {
      stdin,
      workingDirectory,
      timeoutMs: 5 * 60_000,
    });
    if (result.exitCode !== 0) {
      throw new RunnerFailure(
        `In the sandbox, ${what} failed (exit ${result.exitCode}): ${result.stderr.trim().slice(-500)}`,
        'infrastructure',
      );
    }
    return result;
  }
}

/** Every commit names its task (docs/git.md); an existing trailer is kept. */
function commitHook(taskId: string): string {
  return [
    '#!/bin/sh',
    '# Added by Aether-os: every commit names its task (docs/git.md).',
    `git interpret-trailers --in-place --if-exists doNothing --trailer "Aether-Task: ${taskId}" "$1"`,
    '',
  ].join('\n');
}
