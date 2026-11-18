import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  GitHubPullRequests,
  type PullRequestRequest,
} from './pull-requests.js';
import { RunnerFailure } from './runner.errors.js';

describe('GitHubPullRequests', () => {
  let server: Server;
  let apiUrl: string;
  let answers: { status: number; body: unknown }[];
  const requests: {
    method: string;
    path: string;
    authorization?: string;
    body: string;
  }[] = [];

  beforeAll(async () => {
    server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk: Buffer) => (body += chunk.toString()));
      request.on('end', () => {
        requests.push({
          method: request.method ?? '',
          path: request.url ?? '',
          authorization: request.headers.authorization,
          body,
        });
        const answer = answers.shift() ?? { status: 500, body: {} };
        response.writeHead(answer.status, {
          'content-type': 'application/json',
        });
        response.end(JSON.stringify(answer.body));
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    // GitHub Enterprise-style, with a base path.
    apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v3`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  beforeEach(() => {
    requests.length = 0;
  });

  const request = (): PullRequestRequest => ({
    apiUrl,
    token: 'ghs_write',
    repository: 'acme/api',
    branch: 'aether/0193',
    baseBranch: 'main',
    title: 'Fix it',
    body: 'Fixed.',
  });

  it('opens a pull request', async () => {
    answers = [
      {
        status: 201,
        body: {
          number: 7,
          html_url: 'https://github.com/acme/api/pull/7',
          state: 'open',
        },
      },
    ];
    await expect(new GitHubPullRequests().open(request())).resolves.toEqual({
      number: 7,
      url: 'https://github.com/acme/api/pull/7',
      state: 'open',
    });
    expect(requests).toEqual([
      {
        method: 'POST',
        path: '/api/v3/repos/acme/api/pulls',
        authorization: 'Bearer ghs_write',
        body: JSON.stringify({
          title: 'Fix it',
          body: 'Fixed.',
          head: 'aether/0193',
          base: 'main',
        }),
      },
    ]);
  });

  it("adopts and updates the branch's open pull request instead of a second one", async () => {
    answers = [
      { status: 422, body: { message: 'Validation Failed' } },
      { status: 200, body: [{ number: 5 }] },
      {
        status: 200,
        body: {
          number: 5,
          html_url: 'https://github.com/acme/api/pull/5',
          state: 'open',
        },
      },
    ];
    await expect(
      new GitHubPullRequests().open(request()),
    ).resolves.toMatchObject({ number: 5 });
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /api/v3/repos/acme/api/pulls',
      'GET /api/v3/repos/acme/api/pulls?head=acme%3Aaether%2F0193&state=open',
      'PATCH /api/v3/repos/acme/api/pulls/5',
    ]);
    expect(JSON.parse(requests[2].body)).toEqual({
      title: 'Fix it',
      body: 'Fixed.',
    });
  });

  it('fails without retrying when access is refused, and retries otherwise', async () => {
    const failure = async (status: number) => {
      answers = [{ status, body: { message: 'nope' } }];
      const error = await new GitHubPullRequests()
        .open(request())
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RunnerFailure);
      return error as RunnerFailure;
    };
    expect(await failure(403)).toMatchObject({
      reason: 'access_denied',
      retryable: false,
    });
    expect(await failure(502)).toMatchObject({
      reason: 'infrastructure',
      retryable: true,
    });
  });
});
