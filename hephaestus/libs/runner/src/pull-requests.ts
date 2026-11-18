import { RunnerFailure } from './runner.errors.js';

export interface PullRequestRequest {
  /** GitHub's REST API for the repository's host. */
  apiUrl: string;
  /** A write token for the repository (Proxenos). */
  token: string;
  /** `owner/name`. */
  repository: string;
  branch: string;
  baseBranch: string;
  title: string;
  body: string;
}

export interface OpenedPullRequest {
  number: number;
  url: string;
  state: 'open' | 'merged' | 'closed';
}

/**
 * Pull requests on the provider (docs/git.md: Hephaestus calls the
 * provider's API at delivery, never the agent). `open` is idempotent: the
 * branch's open pull request is adopted and updated, not duplicated.
 * Throws `RunnerFailure`: not retryable when access is refused, retryable
 * otherwise.
 */
export abstract class PullRequests {
  abstract open(request: PullRequestRequest): Promise<OpenedPullRequest>;
}

/** GitHub's REST API (`X-GitHub-Api-Version: 2022-11-28`). */
export class GitHubPullRequests extends PullRequests {
  constructor(private readonly timeoutMs = 10_000) {
    super();
  }

  async open(request: PullRequestRequest): Promise<OpenedPullRequest> {
    const repo = `repos/${request.repository}/pulls`;
    const created = await this.call(request, 'POST', repo, {
      title: request.title,
      body: request.body,
      head: request.branch,
      base: request.baseBranch,
    });
    if (created.status === 201) {
      return opened(await created.json());
    }
    if (created.status !== 422) {
      throw await failure(created, 'opening the pull request');
    }
    // "A pull request already exists": the tree's earlier round opened it.
    const owner = request.repository.split('/')[0];
    const query = new URLSearchParams({
      head: `${owner}:${request.branch}`,
      state: 'open',
    });
    const existing = await this.call(request, 'GET', `${repo}?${query}`);
    if (!existing.ok) {
      throw await failure(existing, 'finding the open pull request');
    }
    const [pullRequest] = (await existing.json()) as { number: number }[];
    if (!pullRequest) {
      throw await failure(created, 'opening the pull request');
    }
    const updated = await this.call(
      request,
      'PATCH',
      `${repo}/${pullRequest.number}`,
      {
        title: request.title,
        body: request.body,
      },
    );
    if (!updated.ok) {
      throw await failure(updated, 'updating the pull request');
    }
    return opened(await updated.json());
  }

  private async call(
    request: PullRequestRequest,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const base = request.apiUrl.endsWith('/')
      ? request.apiUrl
      : `${request.apiUrl}/`;
    try {
      return await fetch(new URL(path, base), {
        method,
        headers: {
          authorization: `Bearer ${request.token}`,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          'user-agent': 'aether-os-hephaestus',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new RunnerFailure(
        `GitHub could not be reached: ${error instanceof Error ? error.message : String(error)}`,
        'infrastructure',
      );
    }
  }
}

function opened(body: unknown): OpenedPullRequest {
  const pr = body as {
    number: number;
    html_url: string;
    state: string;
    merged?: boolean;
  };
  return {
    number: pr.number,
    url: pr.html_url,
    state: pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : 'open',
  };
}

async function failure(
  response: Response,
  what: string,
): Promise<RunnerFailure> {
  const { message } = ((await response.json().catch(() => ({}))) ?? {}) as {
    message?: string;
  };
  const detail = `${response.status}${message ? `: ${message}` : ''}`;
  return [401, 403, 404].includes(response.status)
    ? new RunnerFailure(`GitHub refused ${what} (${detail})`, 'access_denied')
    : new RunnerFailure(
        `GitHub failed ${what} (${detail})`,
        'infrastructure',
        response.status !== 422,
      );
}
