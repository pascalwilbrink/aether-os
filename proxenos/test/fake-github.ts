import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { importSPKI, jwtVerify } from 'jose';

export const APP_ID = '424242';

interface FakeInstallation {
  id: string;
  account: { login: string; type: 'Organization' | 'User' };
  repositorySelection: 'all' | 'selected';
  suspended: boolean;
  repositories: {
    id: string;
    fullName: string;
    defaultBranch: string;
    private: boolean;
  }[];
}

/**
 * A GitHub for tests, in the test process: the OAuth code exchange, a
 * person's installations, and the App API (JWT checked against the app's
 * public key) under `/api/v3`, as on GitHub Enterprise Server.
 */
export class FakeGitHub {
  readonly keys = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    // GitHub hands out PKCS#1 keys.
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  readonly installations = new Map<string, FakeInstallation>();
  /** OAuth code → the installation IDs that person can access. */
  readonly codes = new Map<string, string[]>();
  /** Every installation token asked for. */
  readonly tokenRequests: {
    installationId: string;
    body: Record<string, unknown>;
  }[] = [];
  private readonly userTokens = new Map<string, string[]>();
  private readonly installationTokens = new Map<string, string>();
  private server: Server | null = null;
  url = '';

  async start(): Promise<this> {
    this.server = createServer((request, response) => {
      this.handle(request)
        .then(({ status, body }) => {
          response.writeHead(status, { 'content-type': 'application/json' });
          response.end(JSON.stringify(body));
        })
        .catch((error: unknown) => {
          response.writeHead(500);
          response.end(String(error));
        });
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, '127.0.0.1', resolve),
    );
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  reset(): void {
    this.installations.clear();
    this.codes.clear();
    this.tokenRequests.length = 0;
    this.userTokens.clear();
    this.installationTokens.clear();
  }

  addInstallation(
    id: string,
    repositories: FakeInstallation['repositories'],
    options: Partial<Omit<FakeInstallation, 'id' | 'repositories'>> = {},
  ): FakeInstallation {
    const installation = {
      id,
      account: { login: 'acme', type: 'Organization' as const },
      repositorySelection: 'selected' as const,
      suspended: false,
      repositories,
      ...options,
    };
    this.installations.set(id, installation);
    return installation;
  }

  private async handle(
    request: IncomingMessage,
  ): Promise<{ status: number; body: unknown }> {
    const url = new URL(request.url ?? '/', this.url);
    const body = await readBody(request);
    const auth = request.headers.authorization ?? '';

    if (
      request.method === 'POST' &&
      url.pathname === '/login/oauth/access_token'
    ) {
      const form = new URLSearchParams(body);
      const ids = this.codes.get(form.get('code') ?? '');
      if (!ids || form.get('client_secret') !== 'client-secret') {
        return { status: 200, body: { error: 'bad_verification_code' } };
      }
      this.codes.delete(form.get('code')!); // A code works once.
      const token = `ghu_${randomBytes(8).toString('hex')}`;
      this.userTokens.set(token, ids);
      return {
        status: 200,
        body: { access_token: token, token_type: 'bearer' },
      };
    }
    if (!url.pathname.startsWith('/api/v3/')) {
      return { status: 404, body: { message: 'Not Found' } };
    }
    const path = url.pathname.slice('/api/v3'.length);
    if (request.headers['x-github-api-version'] !== '2022-11-28') {
      return { status: 400, body: { message: 'API version' } };
    }

    if (
      path === '/users/aether-os-test%5Bbot%5D' ||
      path === '/users/aether-os-test[bot]'
    ) {
      return {
        status: 200,
        body: { id: 4242, login: 'aether-os-test[bot]', type: 'Bot' },
      };
    }
    if (path === '/user/installations') {
      const ids = this.userTokens.get(auth.replace(/^Bearer /, ''));
      if (!ids) return { status: 401, body: { message: 'Bad credentials' } };
      return {
        status: 200,
        body: { installations: ids.map((id) => ({ id: Number(id) })) },
      };
    }
    if (path === '/installation/repositories') {
      const id = this.installationTokens.get(auth.replace(/^Bearer /, ''));
      const installation = id ? this.installations.get(id) : undefined;
      if (!installation)
        return { status: 401, body: { message: 'Bad credentials' } };
      const page = Number(url.searchParams.get('page') ?? '1');
      return {
        status: 200,
        body: {
          repositories: (page === 1 ? installation.repositories : []).map(
            (repository) => ({
              id: Number(repository.id),
              full_name: repository.fullName,
              default_branch: repository.defaultBranch,
              private: repository.private,
            }),
          ),
        },
      };
    }
    const match = /^\/app\/installations\/(\d+)(\/access_tokens)?$/.exec(path);
    if (match) {
      if (!(await this.isAppJwt(auth))) {
        return {
          status: 401,
          body: { message: 'A JSON web token could not be decoded' },
        };
      }
      const installation = this.installations.get(match[1]);
      if (!installation) return { status: 404, body: { message: 'Not Found' } };
      if (!match[2]) {
        return {
          status: 200,
          body: {
            id: Number(installation.id),
            account: installation.account,
            repository_selection: installation.repositorySelection,
            suspended_at: installation.suspended
              ? new Date().toISOString()
              : null,
          },
        };
      }
      if (request.method !== 'POST') return { status: 404, body: {} };
      if (installation.suspended)
        return { status: 403, body: { message: 'suspended' } };
      this.tokenRequests.push({
        installationId: installation.id,
        body: JSON.parse(body || '{}'),
      });
      const token = `ghs_${randomBytes(8).toString('hex')}`;
      this.installationTokens.set(token, installation.id);
      return {
        status: 201,
        body: {
          token,
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        },
      };
    }
    return { status: 404, body: { message: 'Not Found' } };
  }

  private async isAppJwt(authorization: string): Promise<boolean> {
    try {
      const key = await importSPKI(this.keys.publicKey, 'RS256');
      const { payload } = await jwtVerify(
        authorization.replace(/^Bearer /, ''),
        key,
        {
          issuer: APP_ID,
        },
      );
      return (
        typeof payload.exp === 'number' &&
        payload.exp - (payload.iat ?? 0) <= 600
      );
    } catch {
      return false;
    }
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}
