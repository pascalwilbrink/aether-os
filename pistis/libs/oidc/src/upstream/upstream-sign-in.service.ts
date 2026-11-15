import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Adapter } from 'oidc-provider';
import * as client from 'openid-client';
import type { Repository } from 'typeorm';

import type { Env, UpstreamProviderConfig } from '@pistis/core';
import type { SignInIdentity } from '@pistis/users';

import { OidcPayloadEntity } from '../oidc-payload.entity.js';
import { postgresOidcAdapter } from '../postgres-oidc-adapter.js';

/** How long someone has to come back from the upstream provider. */
const PENDING_TTL_SECONDS = 10 * 60;

/** A sign-in started at an upstream provider, stored under its `state`. */
interface PendingSignIn {
  uid: string;
  provider: string;
  codeVerifier: string;
  nonce: string;
}

export interface UpstreamProvider {
  id: string;
  name: string;
}

/** The upstream provider refused, or its answer didn't check out. */
export class UpstreamSignInError extends Error {}

/**
 * Signing in through external OpenID Connect providers
 * (`PISTIS_UPSTREAM_PROVIDERS`): any standard provider, configured by
 * issuer, client ID and secret, through `openid-client`.
 *
 * Pistis is the upstream's relying party: authorization code with PKCE,
 * `state` and `nonce`, the ID token verified against the upstream's keys.
 * The result is an identity (`provider` = the configured id, `subject` =
 * the upstream `sub`) for `AccountsService.resolveSignIn`; upstream tokens
 * are used for nothing else and never stored (docs/identity.md).
 *
 * The upstream redirects back to one fixed URL per provider,
 * `/interaction/callback/:provider`. The pending sign-in (stored in
 * `oidc_payloads` under its `state`, single use, 10 minutes) names the
 * interaction it belongs to; the code is only redeemed on that interaction's
 * own URL, where oidc-provider's interaction cookie proves it's the same
 * browser that started it.
 */
@Injectable()
export class UpstreamSignInService {
  private readonly logger = new Logger(UpstreamSignInService.name);
  private readonly providers: Map<string, UpstreamProviderConfig>;
  private readonly configurations = new Map<
    string,
    Promise<client.Configuration>
  >();
  private readonly pending: Adapter;
  private readonly issuer: string;

  constructor(
    config: ConfigService<Env, true>,
    @InjectRepository(OidcPayloadEntity)
    payloads: Repository<OidcPayloadEntity>,
  ) {
    this.providers = new Map(
      config
        .get('PISTIS_UPSTREAM_PROVIDERS', { infer: true })
        .map((provider) => [provider.id, provider]),
    );
    this.pending = new (postgresOidcAdapter(payloads))('UpstreamSignIn');
    this.issuer = config.get('PISTIS_ISSUER', { infer: true });
  }

  /** The configured providers, for the sign-in page. */
  list(): UpstreamProvider[] {
    return [...this.providers.values()].map(({ id, name }) => ({ id, name }));
  }

  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  /** Where the upstream sends people back: registered with the upstream. */
  redirectUri(providerId: string): string {
    return new URL(
      `/interaction/callback/${encodeURIComponent(providerId)}`,
      this.issuer,
    ).href;
  }

  /** Starts a sign-in for interaction `uid`: the upstream URL to redirect to. */
  async start(uid: string, providerId: string): Promise<URL> {
    const provider = this.provider(providerId);
    const configuration = await this.configuration(provider);
    const state = client.randomState();
    const nonce = client.randomNonce();
    const codeVerifier = client.randomPKCECodeVerifier();
    await this.pending.upsert(
      state,
      {
        uid,
        provider: provider.id,
        codeVerifier,
        nonce,
      } satisfies PendingSignIn,
      PENDING_TTL_SECONDS,
    );

    return client.buildAuthorizationUrl(configuration, {
      redirect_uri: this.redirectUri(provider.id),
      scope: provider.scopes,
      response_type: 'code',
      state,
      nonce,
      code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });
  }

  /**
   * The interaction a callback belongs to, or null for an unknown or
   * expired `state` (or one from another provider).
   */
  async interactionOf(
    providerId: string,
    state: string | undefined,
  ): Promise<string | null> {
    const pending = state ? await this.findPending(state) : undefined;
    return pending?.provider === providerId ? pending.uid : null;
  }

  /**
   * Completes the sign-in on interaction `uid` with the callback's query
   * (`code`, `state`, maybe `iss`, or the upstream's `error`): the
   * authenticated identity. Each `state` works once.
   */
  async complete(
    uid: string,
    providerId: string,
    query: URLSearchParams,
  ): Promise<SignInIdentity> {
    const state = query.get('state') ?? undefined;
    const pending = state ? await this.findPending(state) : undefined;
    if (
      !state ||
      !pending ||
      pending.uid !== uid ||
      pending.provider !== providerId
    ) {
      throw new UpstreamSignInError(
        'This sign-in has expired. Please try again.',
      );
    }
    await this.pending.destroy(state);

    const provider = this.provider(providerId);
    const upstreamError = query.get('error');
    if (upstreamError) {
      this.logger.log(`${provider.id} refused a sign-in: ${upstreamError}`);
      throw new UpstreamSignInError(`${provider.name} did not sign you in.`);
    }

    const callbackUrl = new URL(this.redirectUri(provider.id));
    callbackUrl.search = query.toString();
    try {
      const tokens = await client.authorizationCodeGrant(
        await this.configuration(provider),
        callbackUrl,
        {
          pkceCodeVerifier: pending.codeVerifier,
          expectedState: state,
          expectedNonce: pending.nonce,
          idTokenExpected: true,
        },
      );
      const claims = tokens.claims();
      if (!claims?.sub) {
        throw new Error('no sub in the ID token');
      }

      return {
        provider: provider.id,
        subject: claims.sub,
        email: typeof claims.email === 'string' ? claims.email : null,
        emailVerified: claims.email_verified === true,
        displayName: typeof claims.name === 'string' ? claims.name : null,
      };
    } catch (error) {
      this.logger.warn(
        `Signing in with ${provider.id} failed: ${String(error)}`,
      );
      throw new UpstreamSignInError(
        `Signing in with ${provider.name} failed. Please try again.`,
      );
    }
  }

  private provider(providerId: string): UpstreamProviderConfig {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new UpstreamSignInError(`Unknown sign-in provider ${providerId}.`);
    }
    return provider;
  }

  private async findPending(state: string): Promise<PendingSignIn | undefined> {
    return (await this.pending.find(state)) as PendingSignIn | undefined;
  }

  /** The upstream's metadata, discovered on first use (and again after a failure). */
  private configuration(
    provider: UpstreamProviderConfig,
  ): Promise<client.Configuration> {
    let configuration = this.configurations.get(provider.id);
    if (!configuration) {
      configuration = client
        .discovery(
          new URL(provider.issuer),
          provider.clientId,
          provider.clientSecret,
          provider.clientSecret ? undefined : client.None(),
          {
            timeout: 10,
            // http only outside production (env.ts refuses it there).
            execute: provider.issuer.startsWith('http:')
              ? [client.allowInsecureRequests]
              : [],
          },
        )
        .catch((error: unknown) => {
          this.configurations.delete(provider.id);
          this.logger.warn(
            `Discovering ${provider.issuer} failed: ${String(error)}`,
          );
          throw new UpstreamSignInError(
            `${provider.name} can't be reached right now.`,
          );
        });
      this.configurations.set(provider.id, configuration);
    }
    return configuration;
  }
}
