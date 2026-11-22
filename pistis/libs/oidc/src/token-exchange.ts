import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { errors, type Provider } from 'oidc-provider';

import {
  effectiveProjectRole,
  projectRoleGrants,
  zAccessTokenClaims,
  type Env,
} from '@pistis/core';
import { UsersService } from '@pistis/users';
import {
  ServiceAccountsService,
  type ServiceAccountIdentity,
} from '@pistis/service-accounts';

import { PolisDirectory } from './polis-directory.js';
import { API_SCOPE, AUDIENCE, organizationOf } from './resources.js';
import {
  publicKeys,
  SIGNING_KEYS,
  TokenSigner,
  type SigningKeys,
} from './token-signer.js';

/** OAuth 2.0 Token Exchange (RFC 8693). */
export const TOKEN_EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange';
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';
/** An API key of a service account, for a token of that service account. */
export const API_KEY_TOKEN_TYPE = 'urn:aether-os:token-type:api-key';
/** A service account's ID, for a task token (platform services only). */
export const SERVICE_ACCOUNT_TOKEN_TYPE =
  'urn:aether-os:token-type:service-account';

/** The public client API keys are exchanged with (no secret of its own). */
export const API_KEY_CLIENT = {
  client_id: 'api-key',
  token_endpoint_auth_method: 'none',
  grant_types: [TOKEN_EXCHANGE],
  response_types: [],
  redirect_uris: [],
};

/** What a client may exchange for, beyond API keys (`token_exchange` client metadata). */
export const TASK_TOKEN = 'task-token';
const TASK_TOKEN_MAX_TTL = 3600;
/** A person's session with an agent (docs/interaction.md): `session-token` clients only (Hephaestus). */
export const SESSION_TOKEN = 'session-token';
const SESSION_TOKEN_MAX_TTL = 900;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Token exchange at `/oidc/token` (docs/identity.md, Tokens), for service
 * accounts:
 *
 * - **API key → token:** client `api-key`, `subject_token` = the key,
 *   `subject_token_type` = `urn:aether-os:token-type:api-key`. A token for
 *   the service account's organization, like a user's.
 * - **Task token:** a platform service whose client may (`token_exchange:
 *   ['task-token']`, i.e. Hephaestus) exchanges for a token of a service
 *   account, `subject_token` = its ID, limited to `project_id`, carrying
 *   `task_id` and `act` (the service), for at most an hour (`expires_in`);
 *   optionally `task_tree_id`, `agent_id` and `agent_version_id`, which
 *   Pylon uses for budgets, keys and attribution (docs/pylon.md).
 *
 * - **Session token:** a platform service whose client may
 *   (`token_exchange: ['session-token']`, Hephaestus) exchanges a person's
 *   own access token (`subject_token_type` access token: one Pistis issued
 *   for an organization, not itself a session or task token) for a token of
 *   that person limited to `project_id` and `session_id`, with `act` (the
 *   service) and optionally `agent_id` and `agent_version_id`, for at most
 *   15 minutes. Krepis lets it read and call models for the session only
 *   (docs/interaction.md, Session tokens). The person must still be active,
 *   a member of the active organization, and have `session:use` in the
 *   project.
 *
 * All ask Polis, like every token: the service account must be a member
 * of an active organization, and its roles go in the token. A task token
 * also needs a role in the project. Tokens are JWTs shaped like
 * oidc-provider's own (`TokenSigner`).
 */
@Injectable()
export class TokenExchange {
  constructor(
    private readonly accounts: ServiceAccountsService,
    private readonly directory: PolisDirectory,
    private readonly signer: TokenSigner,
    private readonly config: ConfigService<Env, true>,
    private readonly users: UsersService,
    @Inject(SIGNING_KEYS) private readonly keys: SigningKeys,
  ) {}

  register(provider: Provider): void {
    provider.registerGrantType(
      TOKEN_EXCHANGE,
      async (ctx) => {
        const params = ctx.oidc.params as Record<string, string | undefined>;
        ctx.body = await this.exchange(
          {
            clientId: ctx.oidc.client.clientId,
            metadata: ctx.oidc.client.metadata(),
          },
          params,
        );
      },
      [
        'subject_token',
        'subject_token_type',
        'requested_token_type',
        'resource',
        'scope',
        'project_id',
        'task_id',
        'task_tree_id',
        'agent_id',
        'agent_version_id',
        'session_id',
        'expires_in',
      ],
    );
  }

  private async exchange(
    client: { clientId: string; metadata: Record<string, unknown> },
    params: Record<string, string | undefined>,
  ) {
    const {
      subject_token: subjectToken,
      subject_token_type: subjectTokenType,
    } = params;
    if (!subjectToken || !subjectTokenType) {
      throw new errors.InvalidRequest(
        'subject_token and subject_token_type are required',
      );
    }
    if (
      params.requested_token_type &&
      params.requested_token_type !== ACCESS_TOKEN_TYPE
    ) {
      throw new errors.InvalidRequest('only access tokens can be requested');
    }

    if (subjectTokenType === API_KEY_TOKEN_TYPE) {
      if (client.clientId !== API_KEY_CLIENT.client_id) {
        throw new errors.UnauthorizedClient(
          'API keys are exchanged with the api-key client',
        );
      }
      const identity = await this.accounts.authenticateApiKey(subjectToken);
      if (!identity) {
        throw new errors.InvalidGrant('invalid API key');
      }
      if (
        params.resource &&
        organizationOf(params.resource) !== identity.organizationId
      ) {
        throw new errors.InvalidTarget(
          "an API key is for its service account's organization",
        );
      }
      const ttl = this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true });
      return this.issue(identity, ttl, {});
    }

    if (subjectTokenType === SERVICE_ACCOUNT_TOKEN_TYPE) {
      const allowed = client.metadata['token_exchange'];
      if (!Array.isArray(allowed) || !allowed.includes(TASK_TOKEN)) {
        throw new errors.UnauthorizedClient(
          'this client may not obtain task tokens',
        );
      }
      const projectId = params.project_id;
      const taskId = params.task_id;
      if (
        !projectId ||
        !UUID.test(projectId) ||
        !taskId ||
        !UUID.test(taskId)
      ) {
        throw new errors.InvalidRequest(
          'project_id and task_id (UUIDs) are required',
        );
      }
      const optional = {
        task_tree_id: params.task_tree_id,
        agent_id: params.agent_id,
        agent_version_id: params.agent_version_id,
      };
      for (const [name, value] of Object.entries(optional)) {
        if (value !== undefined && !UUID.test(value)) {
          throw new errors.InvalidRequest(`${name} must be a UUID`);
        }
      }
      const requested = params.expires_in
        ? Number(params.expires_in)
        : TASK_TOKEN_MAX_TTL;
      if (!Number.isInteger(requested) || requested < 60) {
        throw new errors.InvalidRequest(
          'expires_in must be at least 60 seconds',
        );
      }
      const identity = UUID.test(subjectToken)
        ? await this.accounts.findActive(subjectToken)
        : null;
      if (!identity) {
        throw new errors.InvalidGrant('unknown or disabled service account');
      }
      return this.issue(identity, Math.min(requested, TASK_TOKEN_MAX_TTL), {
        projectId,
        taskId,
        actor: client.clientId,
        claims: Object.fromEntries(
          Object.entries(optional).filter(([, value]) => value !== undefined),
        ),
      });
    }

    if (subjectTokenType === ACCESS_TOKEN_TYPE) {
      return this.sessionToken(client, subjectToken, params);
    }

    throw new errors.InvalidRequest(
      `unsupported subject_token_type ${subjectTokenType}`,
    );
  }

  /** A person's access token → their session token (Hephaestus's sessions). */
  private async sessionToken(
    client: { clientId: string; metadata: Record<string, unknown> },
    subjectToken: string,
    params: Record<string, string | undefined>,
  ) {
    const allowed = client.metadata['token_exchange'];
    if (!Array.isArray(allowed) || !allowed.includes(SESSION_TOKEN)) {
      throw new errors.UnauthorizedClient(
        'this client may not obtain session tokens',
      );
    }
    const { project_id: projectId, session_id: sessionId } = params;
    if (
      !projectId ||
      !UUID.test(projectId) ||
      !sessionId ||
      !UUID.test(sessionId)
    ) {
      throw new errors.InvalidRequest(
        'project_id and session_id (UUIDs) are required',
      );
    }
    const optional = {
      agent_id: params.agent_id,
      agent_version_id: params.agent_version_id,
    };
    for (const [name, value] of Object.entries(optional)) {
      if (value !== undefined && !UUID.test(value)) {
        throw new errors.InvalidRequest(`${name} must be a UUID`);
      }
    }
    const requested = params.expires_in
      ? Number(params.expires_in)
      : SESSION_TOKEN_MAX_TTL;
    if (!Number.isInteger(requested) || requested < 60) {
      throw new errors.InvalidRequest('expires_in must be at least 60 seconds');
    }

    const subject = await this.verifiedUserToken(subjectToken);
    const user = await this.users.findById(subject.sub).catch(() => null);
    if (user?.status !== 'active') {
      throw new errors.InvalidGrant('unknown or disabled user');
    }
    const organizationId = subject.org_id;
    const [roles, status, projectRoles] = await Promise.all([
      this.directory.membershipRoles(subject.sub, organizationId, 'user'),
      this.directory.organizationStatus(organizationId),
      this.directory.projectRoles(subject.sub, organizationId, 'user'),
    ]);
    if (!roles) {
      throw new errors.InvalidGrant(
        'the user is not a member of the organization',
      );
    }
    if (status !== 'active') {
      throw new errors.InvalidGrant('the organization is suspended');
    }
    if (
      !projectRoleGrants(
        effectiveProjectRole(roles, projectRoles[projectId]),
        'session:use',
      )
    ) {
      throw new errors.InvalidTarget(
        'the user may not use sessions in that project',
      );
    }
    const ttl = Math.min(requested, SESSION_TOKEN_MAX_TTL);
    const accessToken = await this.signer.sign(
      {
        sub: subject.sub,
        sub_type: 'user',
        org_id: organizationId,
        org_roles: roles,
        project_roles: projectRoles,
        scope: API_SCOPE,
        project_id: projectId,
        session_id: sessionId,
        ...Object.fromEntries(
          Object.entries(optional).filter(([, value]) => value !== undefined),
        ),
        act: { sub: client.clientId, sub_type: 'service' },
      },
      ttl,
    );
    return {
      access_token: accessToken,
      issued_token_type: ACCESS_TOKEN_TYPE,
      token_type: 'Bearer',
      expires_in: ttl,
    };
  }

  /**
   * A person's access token Pistis issued for an organization, checked
   * against Pistis's own keys; not a session or task token (no chains).
   */
  private async verifiedUserToken(
    token: string,
  ): Promise<{ sub: string; org_id: string }> {
    let payload: unknown;
    try {
      ({ payload } = await jwtVerify(
        token,
        createLocalJWKSet(
          publicKeys(this.keys) as Parameters<typeof createLocalJWKSet>[0],
        ),
        {
          issuer: this.config.get('PISTIS_ISSUER', { infer: true }),
          audience: AUDIENCE,
          typ: 'at+jwt',
        },
      ));
    } catch {
      throw new errors.InvalidGrant('the subject token is not valid');
    }
    const claims = zAccessTokenClaims.safeParse(payload);
    if (
      !claims.success ||
      claims.data.sub_type !== 'user' ||
      !claims.data.org_id ||
      claims.data.project_id ||
      claims.data.session_id ||
      claims.data.act
    ) {
      throw new errors.InvalidGrant(
        "the subject token must be a person's token for an organization",
      );
    }
    return { sub: claims.data.sub, org_id: claims.data.org_id };
  }

  private async issue(
    identity: ServiceAccountIdentity,
    ttl: number,
    task: {
      projectId?: string;
      taskId?: string;
      actor?: string;
      /** Task tokens' optional claims (`task_tree_id`, `agent_id`, `agent_version_id`). */
      claims?: Record<string, string | undefined>;
    },
  ) {
    const { serviceAccountId, organizationId } = identity;
    const [roles, status, projectRoles] = await Promise.all([
      this.directory.membershipRoles(
        serviceAccountId,
        organizationId,
        'service_account',
      ),
      this.directory.organizationStatus(organizationId),
      this.directory.projectRoles(
        serviceAccountId,
        organizationId,
        'service_account',
      ),
    ]);
    if (!roles) {
      throw new errors.InvalidGrant(
        'the service account is not a member of its organization',
      );
    }
    if (status !== 'active') {
      throw new errors.InvalidGrant('the organization is suspended');
    }
    if (
      task.projectId &&
      !effectiveProjectRole(roles, projectRoles[task.projectId])
    ) {
      throw new errors.InvalidTarget(
        'the service account has no role in that project',
      );
    }

    const accessToken = await this.signer.sign(
      {
        sub: serviceAccountId,
        sub_type: 'service_account',
        org_id: organizationId,
        org_roles: roles,
        project_roles: projectRoles,
        scope: API_SCOPE,
        ...(task.projectId
          ? { project_id: task.projectId, task_id: task.taskId, ...task.claims }
          : {}),
        ...(task.actor
          ? { act: { sub: task.actor, sub_type: 'service' } }
          : {}),
      },
      ttl,
    );
    return {
      access_token: accessToken,
      issued_token_type: ACCESS_TOKEN_TYPE,
      token_type: 'Bearer',
      expires_in: ttl,
    };
  }
}
