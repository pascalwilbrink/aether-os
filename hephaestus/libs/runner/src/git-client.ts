import { execFile } from 'node:child_process';

/** Credentials for an HTTPS remote: a token used as `x-access-token`'s password. */
export interface GitAuth {
  token: string;
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
    options: { cwd?: string; auth?: GitAuth } = {},
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
    if (options.auth) {
      const basic = Buffer.from(
        `x-access-token:${options.auth.token}`,
      ).toString('base64');
      env.GIT_CONFIG_COUNT = '3';
      env.GIT_CONFIG_KEY_2 = 'http.extraHeader';
      env.GIT_CONFIG_VALUE_2 = `Authorization: Basic ${basic}`;
    }
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
