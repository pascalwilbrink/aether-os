import { execFile } from 'node:child_process';

/** Credentials for an HTTPS remote: a token used as `x-access-token`'s password. */
export interface GitAuth {
  token: string;
}

/** Who rewritten (rebased) commits are committed by. */
export interface GitIdentity {
  name: string;
  email: string;
}

/** The remote refused a push that isn't a fast-forward (someone pushed first). */
export class PushRejectedError extends Error {
  constructor(branch: string) {
    super(`The push to ${branch} was rejected: it moved`);
    this.name = 'PushRejectedError';
  }
}

/** A rebase stopped on conflicts (and was aborted). */
export class RebaseConflictError extends Error {
  constructor(onto: string) {
    super(`The commits conflict with ${onto}`);
    this.name = 'RebaseConflictError';
  }
}

export class GitError extends Error {
  constructor(
    readonly args: string[],
    readonly stderr: string,
  ) {
    super(
      `git ${args[0]} failed: ${stderr.trim().split('\n').slice(-3).join(' ')}`,
    );
    this.name = 'GitError';
  }
}

/**
 * Git on Hephaestus's own side (docs/git.md: the sandbox never holds a
 * token). The `git` CLI with no user or system configuration, no prompts,
 * and credentials only in the environment (`GIT_CONFIG_*`: never on the
 * command line, where other processes could read them, and never written to
 * a repository's config).
 */
export class GitClient {
  constructor(private readonly timeoutMs = 10 * 60_000) {}

  /** Whether the remote has the branch. */
  async hasBranch(
    url: string,
    branch: string,
    auth?: GitAuth,
  ): Promise<boolean> {
    const output = await this.run(
      ['ls-remote', '--heads', url, `refs/heads/${branch}`],
      { auth },
    );
    return output.trim().length > 0;
  }

  /** The commit the remote's branch points at, or null if it has none. */
  async remoteHead(
    url: string,
    branch: string,
    auth?: GitAuth,
  ): Promise<string | null> {
    const output = await this.run(
      ['ls-remote', '--heads', url, `refs/heads/${branch}`],
      { auth },
    );
    return output.trim().split(/\s+/)[0] || null;
  }

  /** Fetches the remote's branch into `ref`. */
  async fetch(
    directory: string,
    url: string,
    branch: string,
    ref: string,
    auth?: GitAuth,
  ): Promise<void> {
    await this.run(
      ['fetch', '--quiet', '--no-tags', url, `+refs/heads/${branch}:${ref}`],
      { cwd: directory, auth },
    );
  }

  /** The paths that differ between two commits. */
  async changedPaths(
    directory: string,
    from: string,
    to: string,
  ): Promise<string[]> {
    const output = await this.run(
      ['diff', '--name-only', '--no-renames', from, to],
      { cwd: directory },
    );
    return output.split('\n').filter(Boolean);
  }

  /**
   * Replays `base..head` onto `onto` (detached, in this clone) and returns
   * the new head; `RebaseConflictError` (aborted, nothing left behind) on
   * conflicts.
   */
  async rebase(
    directory: string,
    onto: string,
    base: string,
    head: string,
    committer: GitIdentity,
  ): Promise<string> {
    const identity = {
      'user.name': committer.name,
      'user.email': committer.email,
    };
    await this.run(['checkout', '--quiet', '--detach', head], {
      cwd: directory,
    });
    try {
      await this.run(['rebase', '--quiet', '--onto', onto, base], {
        cwd: directory,
        config: identity,
      });
    } catch (error) {
      if (!(error instanceof GitError)) throw error;
      await this.run(['rebase', '--abort'], { cwd: directory }).catch(
        () => undefined,
      );
      throw new RebaseConflictError(onto);
    }
    return this.revParse(directory, 'HEAD');
  }

  /**
   * Pushes `sha` to the remote's branch, never forcing: a branch that moved
   * meanwhile is `PushRejectedError`.
   */
  async push(
    directory: string,
    url: string,
    sha: string,
    branch: string,
    auth?: GitAuth,
  ): Promise<void> {
    try {
      await this.run(
        ['push', '--quiet', '--no-verify', url, `${sha}:refs/heads/${branch}`],
        { cwd: directory, auth },
      );
    } catch (error) {
      if (
        error instanceof GitError &&
        /\b(rejected|non-fast-forward|fetch first)\b/.test(error.stderr)
      ) {
        throw new PushRejectedError(branch);
      }
      throw error;
    }
  }

  /**
   * Deletes the remote's branch (gone already is fine). Git pushes from a
   * repository, so an empty one in `scratch` serves.
   */
  async deleteBranch(
    scratch: string,
    url: string,
    branch: string,
    auth?: GitAuth,
  ): Promise<void> {
    if (!(await this.remoteHead(url, branch, auth))) {
      return;
    }
    await this.run(['init', '--quiet', scratch]);
    await this.run(
      ['push', '--quiet', '--no-verify', url, `:refs/heads/${branch}`],
      { cwd: scratch, auth },
    );
  }

  /** A full clone of one branch (bundles need the history). */
  async clone(
    url: string,
    branch: string,
    directory: string,
    auth?: GitAuth,
  ): Promise<void> {
    await this.run(
      [
        'clone',
        '--quiet',
        '--no-tags',
        '--single-branch',
        '--branch',
        branch,
        url,
        directory,
      ],
      { auth },
    );
  }

  async revParse(directory: string, revision: string): Promise<string> {
    return (
      await this.run(['rev-parse', '--verify', `${revision}^{commit}`], {
        cwd: directory,
      })
    ).trim();
  }

  /** A bundle of `revisions` (e.g. `HEAD`, or `<base>..HEAD`) at `file`. */
  async bundle(
    directory: string,
    file: string,
    revisions: string[],
  ): Promise<void> {
    await this.run(['bundle', 'create', '--quiet', file, ...revisions], {
      cwd: directory,
    });
  }

  /**
   * Fetches a bundle's `HEAD` into `ref` after checking it applies here
   * (its prerequisites are in this repository); returns the fetched commit.
   */
  async fetchBundle(
    directory: string,
    file: string,
    ref: string,
  ): Promise<string> {
    await this.run(['bundle', 'verify', '--quiet', file], { cwd: directory });
    await this.run(['fetch', '--quiet', '--no-tags', file, `+HEAD:${ref}`], {
      cwd: directory,
    });
    return this.revParse(directory, ref);
  }

  async isAncestor(
    directory: string,
    ancestor: string,
    descendant: string,
  ): Promise<boolean> {
    try {
      await this.run(['merge-base', '--is-ancestor', ancestor, descendant], {
        cwd: directory,
      });
      return true;
    } catch (error) {
      if (error instanceof GitError) {
        return false;
      }
      throw error;
    }
  }

  private run(
    args: string[],
    options: {
      cwd?: string;
      auth?: GitAuth;
      config?: Record<string, string>;
    } = {},
  ): Promise<string> {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      // Bundles from sandboxes are untrusted: no hooks, no fsmonitor.
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '/dev/null',
      GIT_CONFIG_KEY_1: 'core.fsmonitor',
      GIT_CONFIG_VALUE_1: 'false',
    };
    const config: Record<string, string> = { ...options.config };
    if (options.auth) {
      const basic = Buffer.from(
        `x-access-token:${options.auth.token}`,
      ).toString('base64');
      config['http.extraHeader'] = `Authorization: Basic ${basic}`;
    }
    let count = 2;
    for (const [key, value] of Object.entries(config)) {
      env[`GIT_CONFIG_KEY_${count}`] = key;
      env[`GIT_CONFIG_VALUE_${count}`] = value;
      count++;
    }
    env.GIT_CONFIG_COUNT = String(count);
    return new Promise((resolve, reject) => {
      execFile(
        'git',
        args,
        {
          cwd: options.cwd,
          env,
          timeout: this.timeoutMs,
          maxBuffer: 16 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new GitError(args, stderr || error.message));
          } else {
            resolve(stdout);
          }
        },
      );
    });
  }
}
