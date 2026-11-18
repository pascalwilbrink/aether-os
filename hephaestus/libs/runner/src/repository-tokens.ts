import { createProxenosHttpClient, ProxenosApi } from '@hephaestus/core';
import type { TaskResponse } from '@hephaestus/tasks';

import { RunnerFailure } from './runner.errors.js';

/** A short-lived token for one repository, and where it is. */
export interface RepositoryCredentials {
  token: string;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  /** GitHub's REST API for the repository's host. */
  apiUrl: string;
  /** The GitHub App's bot identity: who Aether-os commits as. */
  committer: { name: string; email: string };
}

/**
 * Repository tokens for a running task (docs/git.md, Credentials): Proxenos
 * mints them for the task's own token, narrowed to its repository and to
 * read or write. Never stored, never given to the sandbox. Throws
 * `RunnerFailure`: without retrying when the repository or access is gone,
 * retryable when Proxenos can't be reached.
 */
export abstract class RepositoryTokens {
  abstract issue(
    task: TaskResponse,
    taskToken: string,
    access: 'read' | 'write',
  ): Promise<RepositoryCredentials>;
}

/** No Proxenos configured: tasks with a repository fail. */
export class NoRepositoryTokens extends RepositoryTokens {
  issue(): Promise<RepositoryCredentials> {
    return Promise.reject(
      new RunnerFailure(
        'The task works in a repository, and no Proxenos is configured (PROXENOS_URL)',
        'infrastructure',
        false,
      ),
    );
  }
}

/** Proxenos's API, with the generated client and the task's token. */
export class HttpRepositoryTokens extends RepositoryTokens {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 10_000,
  ) {
    super();
  }

  async issue(
    task: TaskResponse,
    taskToken: string,
    access: 'read' | 'write',
  ): Promise<RepositoryCredentials> {
    const linkId = task.repository?.linkId;
    if (!linkId) {
      throw new Error(`Task ${task.id} works in no repository`);
    }
    const client = createProxenosHttpClient({
      baseUrl: this.baseUrl,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(this.timeoutMs) }),
      auth: () => taskToken,
    });
    let result: Awaited<ReturnType<typeof ProxenosApi.createRepositoryToken>>;
    try {
      result = await ProxenosApi.createRepositoryToken({
        client,
        path: {
          organizationId: task.organizationId,
          projectId: task.projectId,
          linkId,
        },
        body: { access },
      });
    } catch (error) {
      throw new RunnerFailure(
        `Proxenos could not be reached: ${error instanceof Error ? error.message : String(error)}`,
        'infrastructure',
      );
    }
    const { data, response } = result;
    const status = response?.status ?? 0;
    if (response?.ok && data) {
      return {
        token: data.token,
        fullName: data.repository.fullName,
        cloneUrl: data.repository.cloneUrl,
        defaultBranch: data.repository.defaultBranch,
        apiUrl: data.repository.apiUrl,
        committer: data.committer,
      };
    }
    const problem = result.error as
      { detail?: string; code?: string } | undefined;
    const detail = problem?.detail ?? `HTTP ${status}`;
    if (status === 404 || status === 403) {
      throw new RunnerFailure(
        `The task's repository can't be used (${detail})`,
        'access_denied',
      );
    }
    if (status === 409) {
      throw new RunnerFailure(
        `The task's repository can't be used right now (${detail})`,
        'infrastructure',
        false,
      );
    }
    throw new RunnerFailure(
      `Proxenos refused a repository token (${detail})`,
      'infrastructure',
    );
  }
}
