import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Provider, {
  errors,
  type Configuration,
  type KoaContextWithOIDC,
} from 'oidc-provider';
import type { Repository } from 'typeorm';

import { PLATFORM_PERMISSIONS, type Env } from '@pistis/core';

const platformPermissionsOf = (client: {
  [key: string]: unknown;
}): string[] => {
  const permissions = client['platform_permissions'];
  return Array.isArray(permissions)
    ? permissions.filter((permission): permission is string =>
        (PLATFORM_PERMISSIONS as readonly unknown[]).includes(permission),
      )
    : [];
};
import { UsersService } from '@pistis/users';

import { OidcPayloadEntity } from './oidc-payload.entity.js';
import { errorPage } from './pages.js';
import { PolisDirectory } from './polis-directory.js';
import {
  postgresOidcAdapter,
  pruneOidcPayloads,
} from './postgres-oidc-adapter.js';
import {
  API_SCOPE,
  AUDIENCE,
  organizationOf,
  PLATFORM_RESOURCE,
} from './resources.js';
import { signingAlgorithm } from './signing-keys.js';
import { SIGNING_KEYS, type SigningKeys } from './token-signer.js';

/** Where oidc-provider's endpoints are mounted (the issuer's path). */
export const OIDC_PATH = '/oidc';

const DAY = 24 * 60 * 60;

/**
 * Pistis's OpenID Connect provider (`oidc-provider`, docs/engineering.md).
 *
 * - Sign-in and consent happen on Pistis's own pages (`/interaction/:uid`,
 *   `InteractionsController`).
 * - Access tokens are JWTs for a resource (resources.ts): `urn:aether-os`, or
 *   one organization's `urn:aether-os:org:<id>`, with `org_id` and
 *   `org_roles` from Polis's memberships, looked up again each time a token
 *   is issued, so a revoked membership or suspended organization stops new
 *   tokens (docs/identity.md).
 * - Authorization code with PKCE (always), refresh tokens with rotation
 *   (`offline_access`), RP-initiated logout, revocation.
 * - State lives in Postgres (`oidc_payloads`).
 */
@Injectable()
export class OidcProviderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OidcProviderService.name);
  private oidc: Provider | undefined;
  private pruning: NodeJS.Timeout | undefined;

  constructor(
    private readonly config: ConfigService<Env, true>,
    @InjectRepository(OidcPayloadEntity)
    private readonly payloads: Repository<OidcPayloadEntity>,
    private readonly users: UsersService,
    private readonly directory: PolisDirectory,
    @Inject(SIGNING_KEYS) private readonly jwks: SigningKeys,
  ) {}

  get provider(): Provider {
    if (!this.oidc) {
      throw new Error('The OIDC provider is not initialized yet');
    }
    return this.oidc;
  }

  async onModuleInit(): Promise<void> {
    const jwks = this.jwks;
    const production =
      this.config.get('NODE_ENV', { infer: true }) === 'production';

    const configuration: Configuration = {
      adapter: postgresOidcAdapter(this.payloads),
      clients: this.config.get('PISTIS_CLIENTS', {
        infer: true,
      }) as Configuration['clients'],
      // Which platform permissions a platform service may ask for.
      extraClientMetadata: { properties: ['platform_permissions'] },
      clientDefaults: { id_token_signed_response_alg: signingAlgorithm(jwks) },
      jwks,
      cookies: {
        keys: this.config.get('PISTIS_COOKIE_KEYS', { infer: true }) ?? [
          'development-only-cookie-key-not-for-production-use',
        ],
        long: { signed: true, secure: production },
        short: { signed: true, secure: production },
      },
      // OpenID scopes only: `api` is the resource scope (getResourceServerInfo).
      scopes: ['openid', 'offline_access', 'profile', 'email'],
      claims: { openid: ['sub'], profile: ['name'], email: ['email'] },
      findAccount: (_ctx, sub) => this.findAccount(sub),
      pkce: { required: () => true },
      rotateRefreshToken: true,
      ttl: {
        AccessToken: this.config.get('ACCESS_TOKEN_TTL_SECONDS', {
          infer: true,
        }),
        AuthorizationCode: 60,
        IdToken: 3600,
        Interaction: 3600,
        Session: 14 * DAY,
        Grant: 14 * DAY,
        RefreshToken: 14 * DAY,
      },
      features: {
        devInteractions: { enabled: false },
        revocation: { enabled: true },
        // Platform services' own tokens (Hephaestus, operator tooling).
        clientCredentials: { enabled: true },
        rpInitiatedLogout: { enabled: true },
        resourceIndicators: {
          enabled: true,
          defaultResource: () => PLATFORM_RESOURCE,
          useGrantedResource: () => true,
          getResourceServerInfo: (_ctx, resource, client) => {
            if (organizationOf(resource) === undefined) {
              throw new errors.InvalidTarget(`unknown resource ${resource}`);
            }
            return {
              // Platform permissions only on the platform resource, and only
              // those the client was given (`platform_permissions`): users'
              // grants and other clients get `api`.
              scope:
                resource === PLATFORM_RESOURCE
                  ? [API_SCOPE, ...platformPermissionsOf(client)].join(' ')
                  : API_SCOPE,
              audience: AUDIENCE,
              accessTokenFormat: 'jwt',
              accessTokenTTL: this.config.get('ACCESS_TOKEN_TTL_SECONDS', {
                infer: true,
              }),
              jwt: { sign: { alg: signingAlgorithm(jwks) } },
            };
          },
        },
      },
      extraTokenClaims: (ctx, token) => this.extraTokenClaims(ctx, token),
      interactions: {
        url: (_ctx, interaction) => `/interaction/${interaction.uid}`,
      },
      renderError: (ctx, out) => {
        ctx.type = 'html';
        ctx.body = errorPage(out.error_description ?? out.error);
      },
    };

    this.oidc = new Provider(
      this.config.get('PISTIS_ISSUER', { infer: true }),
      configuration,
    );
    // Behind Nest's Express app (and a proxy in production): trust X-Forwarded-*.
    this.oidc.proxy = true;

    this.pruning = setInterval(
      () => {
        pruneOidcPayloads(this.payloads).catch((error: unknown) =>
          this.logger.warn(`Pruning OIDC state failed: ${String(error)}`),
        );
      },
      60 * 60 * 1000,
    );
    this.pruning.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.pruning);
  }

  /** The user behind a `sub`; undefined (so no tokens) if gone or disabled. */
  private async findAccount(sub: string) {
    const user = await this.users.findById(sub).catch(() => null);
    if (!user || user.status !== 'active') {
      return undefined;
    }

    return {
      accountId: user.id,
      claims: () => ({
        sub: user.id,
        name: user.displayName,
        email: user.email ?? undefined,
      }),
    };
  }

  /**
   * The Aether-os claims of an access token (docs/identity.md): `sub_type`,
   * and for an organization resource `org_id`, `org_roles` (from Polis, now)
   * and `project_roles` (explicit grants; Krepis caps them again). A user who
   * isn't a member any more, or a suspended organization, gets no token.
   */
  private async extraTokenClaims(
    _ctx: KoaContextWithOIDC,
    token: Parameters<NonNullable<Configuration['extraTokenClaims']>>[1],
  ): Promise<Record<string, unknown> | undefined> {
    if (token.kind === 'ClientCredentials') {
      return { sub_type: 'service' };
    }
    if (token.kind !== 'AccessToken') {
      return undefined;
    }
    const accountId = (token as { accountId?: string }).accountId;
    const resource = (
      token as { resourceServer?: { identifier(): string } }
    ).resourceServer?.identifier();
    const organizationId = resource ? organizationOf(resource) : null;
    if (!accountId || !organizationId) {
      return { sub_type: 'user' };
    }

    const [roles, status, projectRoles] = await Promise.all([
      this.directory.membershipRoles(accountId, organizationId),
      this.directory.organizationStatus(organizationId),
      this.directory.projectRoles(accountId, organizationId),
    ]);
    if (!roles) {
      throw new errors.InvalidGrant('not a member of the organization');
    }
    if (status !== 'active') {
      throw new errors.InvalidGrant('the organization is suspended');
    }

    return {
      sub_type: 'user',
      org_id: organizationId,
      org_roles: roles,
      project_roles: projectRoles,
    };
  }
}
