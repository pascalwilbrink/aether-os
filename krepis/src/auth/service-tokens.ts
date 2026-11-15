import { ServiceUnavailableException } from '@nestjs/common';
import { decodeJwt } from 'jose';

/**
 * A platform service's own access token (`sub_type: service`, no
 * organization), for calls to other services' platform endpoints
 * (`@PlatformAccess`). Behind an interface, so tests use a fixed token and
 * Pistis signs its own.
 */
export abstract class ServiceTokens {
  /** A token valid for at least another minute. */
  abstract token(): Promise<string>;
}

export interface ClientCredentialsOptions {
  /** Pistis's issuer; the token endpoint is discovered from it. */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** The platform permissions to ask for, e.g. `platform:read`. */
  scope: string;
  timeoutMs?: number;
}

const REFRESH_BEFORE_EXPIRY_MS = 60_000;

/**
 * Service tokens from Pistis with the OAuth client credentials grant
 * (`client_secret_basic`), cached until a minute before they expire;
 * concurrent callers share one request.
 */
export class ClientCredentialsServiceTokens extends ServiceTokens {
  private cached: { token: string; expiresAt: number } | undefined;
  private pending: Promise<string> | undefined;
  private tokenEndpoint: string | undefined;

  constructor(private readonly options: ClientCredentialsOptions) {
    super();
  }

  token(): Promise<string> {
    if (
      this.cached &&
      this.cached.expiresAt - REFRESH_BEFORE_EXPIRY_MS > Date.now()
    ) {
      return Promise.resolve(this.cached.token);
    }
    this.pending ??= this.fetchToken().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async fetchToken(): Promise<string> {
    try {
      const response = await fetch(await this.endpoint(), {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${Buffer.from(
            `${encodeURIComponent(this.options.clientId)}:${encodeURIComponent(this.options.clientSecret)}`,
          ).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: this.options.scope,
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000),
      });
      if (!response.ok) {
        throw new Error(
          `token endpoint answered ${response.status}: ${await response.text()}`,
        );
      }
      const { access_token: token } = (await response.json()) as {
        access_token: string;
      };
      this.cached = { token, expiresAt: (decodeJwt(token).exp ?? 0) * 1000 };
      return token;
    } catch (error) {
      throw new ServiceUnavailableException(
        `Could not get a service token from Pistis: ${String(error)}`,
      );
    }
  }

  private async endpoint(): Promise<string> {
    if (!this.tokenEndpoint) {
      const discovery = `${this.options.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
      const response = await fetch(discovery, {
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000),
      });
      if (!response.ok) {
        throw new Error(`${discovery} answered ${response.status}`);
      }
      this.tokenEndpoint = (
        (await response.json()) as { token_endpoint: string }
      ).token_endpoint;
    }
    return this.tokenEndpoint;
  }
}
