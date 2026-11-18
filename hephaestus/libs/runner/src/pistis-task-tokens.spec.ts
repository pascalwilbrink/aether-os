import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { PistisTaskTokens } from './pistis-task-tokens.js';
import { RunnerFailure } from './runner.errors.js';

const ORG = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const request = {
  serviceAccountId: '0193a1b2-c3d4-7e5f-8a9b-0000000000aa',
  organizationId: ORG,
  projectId: '0193a1b2-c3d4-7e5f-8a9b-0000000000bb',
  taskId: '0193a1b2-c3d4-7e5f-8a9b-0000000000cc',
  expiresInSeconds: 3600,
};

const jwt = (claims: Record<string, unknown>) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;

/** A stand-in for Pistis's discovery document and token endpoint. */
describe('PistisTaskTokens', () => {
  let server: Server;
  let issuer: string;
  let answer: { status: number; body: Record<string, unknown> };
  let received: { authorization?: string; form: URLSearchParams } | undefined;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/oidc/.well-known/openid-configuration') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ token_endpoint: `${issuer}/token` }));
        return;
      }
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        received = {
          authorization: req.headers.authorization,
          form: new URLSearchParams(body),
        };
        res.statusCode = answer.status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(answer.body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}/oidc`;
  });

  afterAll(() => {
    server.close();
  });

  const tokens = () =>
    new PistisTaskTokens({
      issuer,
      clientId: 'hephaestus',
      clientSecret: 'hephaestus-test-secret',
    });

  const failure = (promise: Promise<unknown>) =>
    promise.then(
      () => {
        throw new Error('expected a failure');
      },
      (error: unknown) => error as RunnerFailure,
    );

  it('exchanges the service account for a task token as Hephaestus', async () => {
    const token = jwt({ sub: request.serviceAccountId, org_id: ORG });
    answer = { status: 200, body: { access_token: token } };

    await expect(tokens().issue(request)).resolves.toBe(token);
    expect(received?.authorization).toBe(
      `Basic ${Buffer.from('hephaestus:hephaestus-test-secret').toString('base64')}`,
    );
    expect(Object.fromEntries(received!.form)).toEqual({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: request.serviceAccountId,
      subject_token_type: 'urn:aether-os:token-type:service-account',
      project_id: request.projectId,
      task_id: request.taskId,
      expires_in: '3600',
    });
  });

  it('refuses a service account of another organization', async () => {
    answer = {
      status: 200,
      body: { access_token: jwt({ org_id: 'another-organization' }) },
    };
    const error = await failure(tokens().issue(request));
    expect(error).toMatchObject({ reason: 'access_denied' });
  });

  it.each([
    ['invalid_target', 400, 'access_denied', false],
    ['invalid_grant', 400, 'access_denied', false],
    ['unauthorized_client', 400, 'infrastructure', false],
    ['server_error', 503, 'infrastructure', true],
  ])(
    '%s (%i) is %s, retryable: %s',
    async (code, status, reason, retryable) => {
      answer = { status, body: { error: code } };
      const error = await failure(tokens().issue(request));
      expect(error).toBeInstanceOf(RunnerFailure);
      expect(error).toMatchObject({ reason, retryable });
    },
  );

  it('is a retryable infrastructure failure when Pistis is unreachable', async () => {
    const unreachable = new PistisTaskTokens({
      issuer: 'http://127.0.0.1:1/oidc',
      clientId: 'hephaestus',
      clientSecret: 'hephaestus-test-secret',
      timeoutMs: 500,
    });
    const error = await failure(unreachable.issue(request));
    expect(error).toMatchObject({
      reason: 'infrastructure',
      retryable: true,
    });
  });
});
