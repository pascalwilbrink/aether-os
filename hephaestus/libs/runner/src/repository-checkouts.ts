import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';

import type { ApiTypes } from '@hephaestus/core';
import type { TaskResponse } from '@hephaestus/tasks';

import {
  GitClient,
  GitError,
  PushRejectedError,
  RebaseConflictError,
} from './git-client.js';
import { RepositoryTokens } from './repository-tokens.js';
import { RunnerFailure } from './runner.errors.js';
import type { Sandbox } from './sandbox-provisioner.js';

/** Where the agent finds the repository in its sandbox. */
export const REPOSITORY_PATH = '/workspace/repo';
const BUNDLE_IN = '/tmp/aether-in.bundle';
const BUNDLE_OUT = '/tmp/aether-out.bundle';
/** Pushes that lose a race to a sibling are tried this often. */
const PUSH_ATTEMPTS = 3;

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
  /** The repository's default branch: where pull requests go. */
  baseBranch: string;
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
 * Then they're pushed to the branch (`push`).
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
        baseBranch: credentials.defaultBranch,
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

  /**
   * Pushes the collected commits to the task tree's branch (docs/git.md,
   * Branches and pull requests) with a write token, and returns the
   * branch's new head. Never forced: if the branch moved since the
   * checkout (a sibling subtask pushed), the commits are rebased onto it
   * first, and a push that loses a race is tried again. Commits that change
   * `.github/workflows` are refused here (GitHub would refuse them too: the
   * app has no `workflows` permission). A conflict fails the execution as
   * retryable: the next one starts from the branch's new head.
   */
  async push(
    checkout: Checkout,
    task: TaskResponse,
    taskToken: string,
    headSha: string,
  ): Promise<string> {
    if (!checkout.branch.startsWith('aether/')) {
      throw new Error(
        `Refusing to push to ${checkout.branch}: only aether/* branches`,
      );
    }
    const workflows = (
      await this.git.changedPaths(
        checkout.hostDirectory,
        checkout.baseSha,
        headSha,
      )
    ).filter((path) => path.startsWith('.github/workflows/'));
    if (workflows.length > 0) {
      throw new RunnerFailure(
        `The commits change CI workflows (${workflows.join(', ')}), which Aether-os never pushes`,
        'agent_failed',
      );
    }

    const credentials = await this.tokens.issue(task, taskToken, 'write');
    const auth = { token: credentials.token };
    try {
      for (let attempt = 1; attempt <= PUSH_ATTEMPTS; attempt++) {
        const remote = await this.git.remoteHead(
          credentials.cloneUrl,
          checkout.branch,
          auth,
        );
        let sha = headSha;
        if (remote && remote !== checkout.baseSha && remote !== headSha) {
          await this.git.fetch(
            checkout.hostDirectory,
            credentials.cloneUrl,
            checkout.branch,
            'refs/aether/remote',
            auth,
          );
          sha = await this.git.rebase(
            checkout.hostDirectory,
            'refs/aether/remote',
            checkout.baseSha,
            headSha,
            COMMITTER,
          );
        }
        try {
          await this.git.push(
            checkout.hostDirectory,
            credentials.cloneUrl,
            sha,
            checkout.branch,
            auth,
          );
          return sha;
        } catch (error) {
          if (!(error instanceof PushRejectedError)) throw error;
          this.logger.debug(
            `${checkout.branch} moved while pushing (attempt ${attempt})`,
          );
        }
      }
    } catch (error) {
      if (error instanceof RebaseConflictError) {
        throw new RunnerFailure(
          `The commits conflict with ${checkout.branch}, which moved since the checkout; the task runs again from its head`,
          'infrastructure',
        );
      }
      if (error instanceof GitError) {
        throw new RunnerFailure(
          `Pushing to ${checkout.branch} failed: ${error.message}`,
          'infrastructure',
        );
      }
      throw error;
    }
    throw new RunnerFailure(
      `${checkout.branch} kept moving; the commits weren't pushed`,
      'infrastructure',
    );
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
