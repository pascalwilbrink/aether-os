import { createPrivateKey, type KeyObject } from 'node:crypto';

import { SignJWT } from 'jose';

import { SecretStore, SecretStoreUnavailableError } from '@proxenos/core';

import {
  GitHubApp,
  GitHubNotConfiguredError,
  GitHubUnavailableError,
  type GitHubInstallation,
  type GitHubPermissions,
  type GitHubRepository,
} from './github-app.js';
import { isValidWebhookSignature } from './webhook-signature.js';

export interface GitHubAppOptions {
  /** Absent: no app configured. */
  appId?: string;
  slug?: string;
  clientId?: string;
  /** github.com or a GitHub Enterprise Server. */
  webUrl: string;
  apiUrl: string;
  /** OpenBao path of `{ privateKey, clientSecret, webhookSecret }`. */
  secretPath: string;
  timeoutMs?: number;
}

interface AppSecrets {
  privateKey: KeyObject;
  clientSecret: string;
  webhookSecret: string;
}

/** Secrets are read again after this long (a rotated key is picked up). */
const SECRETS_TTL_MS = 5 * 60_000;

/**
 * The GitHub App over GitHub's REST API (`X-GitHub-Api-Version: 2022-11-28`).
 * Its private key, OAuth client secret and webhook secret come from OpenBao
 * (a platform secret only Proxenos reads, docs/git.md), never from the
 * environment. Calls authenticate as the app (a JWT signed with its key,
 * nine minutes), as an installation (an installation token), or as the
 * person who installed it (their OAuth token, used once and dropped).
 */
export class HttpGitHubApp extends GitHubApp {
  private secrets: { value: AppSecrets; readAt: number } | null = null;
  private bot: { name: string; email: string } | null = null;

  constructor(
    private readonly options: GitHubAppOptions,
    private readonly store: SecretStore,
  ) {
    super();
  }

  get configured(): boolean {
    return Boolean(this.options.appId);
  }

  installUrl(state: string): string {
    const url = new URL(
      `/apps/${encodeURIComponent(this.require(this.options.slug))}/installations/new`,
      this.options.webUrl,
    );
    url.searchParams.set('state', state);
    return url.toString();
  }

  async userCanAccessInstallation(
    code: string,
    installationId: string,
  ): Promise<boolean> {
    const secrets = await this.appSecrets();
    const exchange = await this.request(
      new URL('/login/oauth/access_token', this.options.webUrl),
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.require(this.options.clientId),
          client_secret: secrets.clientSecret,
          code,
        }).toString(),
      },
    );
    const { access_token: userToken } = (await this.json(exchange)) as {
      access_token?: string;
    };
    if (!userToken) {
      // GitHub answers 200 with `error` for a bad or used code.
      return false;
    }
    for (let page = 1; page <= 10; page++) {
      const response = await this.api(
        `/user/installations?per_page=100&page=${page}`,
        `Bearer ${userToken}`,
      );
      const { installations } = (await this.json(response)) as {
        installations: { id: number }[];
      };
      if (installations.some((item) => String(item.id) === installationId)) {
        return true;
      }
      if (installations.length < 100) {
        break;
      }
    }
    return false;
  }

  async installation(
    installationId: string,
  ): Promise<GitHubInstallation | null> {
    const response = await this.api(
      `/app/installations/${encodeURIComponent(installationId)}`,
      `Bearer ${await this.appJwt()}`,
      { allow404: true },
    );
    if (response.status === 404) {
      return null;
    }
    const body = (await this.json(response)) as {
      id: number;
      account: { login: string; type: string } | null;
      repository_selection: 'all' | 'selected';
      suspended_at: string | null;
    };
    return {
      id: String(body.id),
      account: {
        login: body.account?.login ?? 'unknown',
        type: body.account?.type === 'User' ? 'User' : 'Organization',
      },
      repositorySelection: body.repository_selection,
      suspended: body.suspended_at !== null,
    };
  }

  async repositories(installationId: string): Promise<GitHubRepository[]> {
    const { token } = await this.installationToken(installationId, {
      permissions: { metadata: 'read' },
    });
    const repositories: GitHubRepository[] = [];
    for (let page = 1; page <= 100; page++) {
      const response = await this.api(
        `/installation/repositories?per_page=100&page=${page}`,
        `Bearer ${token}`,
      );
      const body = (await this.json(response)) as {
        repositories: {
          id: number;
          full_name: string;
          default_branch: string;
          private: boolean;
        }[];
      };
      repositories.push(
        ...body.repositories.map((repository) => ({
          id: String(repository.id),
          fullName: repository.full_name,
          defaultBranch: repository.default_branch,
          private: repository.private,
        })),
      );
      if (body.repositories.length < 100) {
        break;
      }
    }
    return repositories;
  }

  createToken(
    installationId: string,
    repositoryId: string,
    permissions: GitHubPermissions,
  ): Promise<{ token: string; expiresAt: Date }> {
    return this.installationToken(installationId, {
      repository_ids: [Number(repositoryId)],
      permissions,
    });
  }

  async botIdentity(): Promise<{ name: string; email: string }> {
    if (this.bot) {
      return this.bot;
    }
    const name = `${this.require(this.options.slug)}[bot]`;
    // A public user: no credentials needed.
    const response = await this.request(
      new URL(
        `users/${encodeURIComponent(name)}`,
        withSlash(this.options.apiUrl),
      ),
      { method: 'GET', headers: { 'x-github-api-version': '2022-11-28' } },
    );
    const { id } = (await this.json(response)) as { id: number };
    const host = new URL(this.options.webUrl).hostname;
    this.bot = { name, email: `${id}+${name}@users.noreply.${host}` };
    return this.bot;
  }

  async verifyWebhook(body: Buffer, signature: string): Promise<boolean> {
    const secrets = await this.appSecrets();
    return isValidWebhookSignature(secrets.webhookSecret, body, signature);
  }

  private async installationToken(
    installationId: string,
    body: { repository_ids?: number[]; permissions: GitHubPermissions },
  ): Promise<{ token: string; expiresAt: Date }> {
    const response = await this.api(
      `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
      `Bearer ${await this.appJwt()}`,
      { method: 'POST', body },
    );
    const { token, expires_at } = (await this.json(response)) as {
      token: string;
      expires_at: string;
    };
    return { token, expiresAt: new Date(expires_at) };
  }

  /** The app's JWT (RS256, `iss` = app ID), back-dated a minute for clock skew. */
  private async appJwt(): Promise<string> {
    const { privateKey } = await this.appSecrets();
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(this.require(this.options.appId))
      .setIssuedAt(now - 60)
      .setExpirationTime(now + 9 * 60)
      .sign(privateKey);
  }

  private async appSecrets(): Promise<AppSecrets> {
    this.require(this.options.appId);
    if (this.secrets && Date.now() - this.secrets.readAt < SECRETS_TTL_MS) {
      return this.secrets.value;
    }
    let stored: Record<string, unknown> | null;
    try {
      stored = await this.store.read(this.options.secretPath);
    } catch (error) {
      if (error instanceof SecretStoreUnavailableError) {
        throw new GitHubUnavailableError(error.message);
      }
      throw error;
    }
    const { privateKey, clientSecret, webhookSecret } = stored ?? {};
    if (
      typeof privateKey !== 'string' ||
      typeof clientSecret !== 'string' ||
      typeof webhookSecret !== 'string'
    ) {
      throw new GitHubUnavailableError(
        `The GitHub App's secrets aren't stored at ${this.options.secretPath} (privateKey, clientSecret, webhookSecret)`,
      );
    }
    const value = {
      // GitHub hands out PKCS#1 keys; Node reads both PKCS#1 and PKCS#8.
      privateKey: createPrivateKey(privateKey),
      clientSecret,
      webhookSecret,
    };
    this.secrets = { value, readAt: Date.now() };
    return value;
  }

  private api(
    path: string,
    authorization: string,
    init: { method?: string; body?: unknown; allow404?: boolean } = {},
  ): Promise<Response> {
    return this.request(
      new URL(path.replace(/^\//, ''), withSlash(this.options.apiUrl)),
      {
        method: init.method ?? 'GET',
        headers: {
          authorization,
          'x-github-api-version': '2022-11-28',
          ...(init.body === undefined
            ? {}
            : { 'content-type': 'application/json' }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        allow404: init.allow404,
      },
    );
  }

  private async request(
    url: URL,
    init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
      allow404?: boolean;
    },
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: init.method,
        headers: {
          accept: 'application/json',
          'user-agent': 'aether-os-proxenos',
          ...init.headers,
        },
        body: init.body,
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch (error) {
      throw new GitHubUnavailableError(
        `GitHub could not be reached: ${String(error)}`,
      );
    }
    if (!response.ok && !(init.allow404 && response.status === 404)) {
      throw new GitHubUnavailableError(
        `GitHub answered ${response.status} to ${init.method} ${url.pathname}`,
      );
    }
    return response;
  }

  private async json(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new GitHubUnavailableError(
        'GitHub answered with something other than JSON',
      );
    }
  }

  private require<T>(value: T | undefined): T {
    if (value === undefined) {
      throw new GitHubNotConfiguredError();
    }
    return value;
  }
}

/** So `new URL('x', base)` keeps a base path (GitHub Enterprise's `/api/v3`). */
const withSlash = (url: string) => (url.endsWith('/') ? url : `${url}/`);
