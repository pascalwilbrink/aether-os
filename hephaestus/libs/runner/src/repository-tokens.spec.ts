import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { TaskResponse } from '@hephaestus/tasks';

import { HttpRepositoryTokens } from './repository-tokens.js';
import { RunnerFailure } from './runner.errors.js';

const task = {
  id: 'task-1',
  organizationId: '0193a1b2-c3d4-7e5f-8a9b-000000000001',
  projectId: '0193a1b2-c3d4-7e5f-8a9b-000000000002',
  repository: { linkId: '0193a1b2-c3d4-7e5f-8a9b-000000000003' },
} as TaskResponse;

describe('HttpRepositoryTokens', () => {
  let server: Server;
  let url: string;
  let answer: { status: number; body: unknown };
  const requests: { path: string; authorization?: string; body: string }[] = [];

  beforeAll(async () => {
    server = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk: Buffer) => (body += chunk.toString()));
      request.on('end', () => {
        requests.push({
          path: request.url ?? '',
          authorization: request.headers.authorization,
          body,
        });
        response.writeHead(answer.status, {
          'content-type': 'application/json',
        });
        response.end(JSON.stringify(answer.body));
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const failure = async (promise: Promise<unknown>) => {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(RunnerFailure);
    return error as RunnerFailure;
  };

  it("asks Proxenos with the task's own token", async () => {
    answer = {
      status: 201,
      body: {
        token: 'ghs_abc',
        expiresAt: '2026-11-18T12:00:00.000Z',
        access: 'read',
        repository: {
          fullName: 'acme/api',
          cloneUrl: 'https://github.com/acme/api.git',
          defaultBranch: 'main',
        },
      },
    };
    await expect(
      new HttpRepositoryTokens(url).issue(task, 'task-token', 'read'),
    ).resolves.toEqual({
      token: 'ghs_abc',
      fullName: 'acme/api',
      cloneUrl: 'https://github.com/acme/api.git',
      defaultBranch: 'main',
    });
    expect(requests.at(-1)).toEqual({
      path: `/v1/organizations/${task.organizationId}/projects/${task.projectId}/repositories/${task.repository!.linkId}/tokens`,
      authorization: 'Bearer task-token',
      body: '{"access":"read"}',
    });
  });

  it('fails without retrying when the repository is gone or not usable, and retries otherwise', async () => {
    const tokens = new HttpRepositoryTokens(url);
    answer = { status: 404, body: { detail: 'Repository link not found' } };
    expect(await failure(tokens.issue(task, 't', 'read'))).toMatchObject({
      reason: 'access_denied',
      retryable: false,
      message:
        "The task's repository can't be used (Repository link not found)",
    });
    answer = {
      status: 409,
      body: { code: 'INSTALLATION_NOT_ACTIVE', detail: 'suspended' },
    };
    expect(await failure(tokens.issue(task, 't', 'read'))).toMatchObject({
      reason: 'infrastructure',
      retryable: false,
    });
    answer = { status: 503, body: { detail: 'GitHub is down' } };
    expect(await failure(tokens.issue(task, 't', 'read'))).toMatchObject({
      reason: 'infrastructure',
      retryable: true,
    });
    expect(
      await failure(
        new HttpRepositoryTokens('http://127.0.0.1:9').issue(task, 't', 'read'),
      ),
    ).toMatchObject({ reason: 'infrastructure', retryable: true });
  });
});
