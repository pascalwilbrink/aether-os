import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';

export interface SessionTokenRequest {
  /** The person's own access token, as their request carried it. */
  userToken: string;
  projectId: string;
  sessionId: string;
  agentId: string;
  agentVersionId: string;
  /** At most 900 (Pistis's limit). */
  expiresInSeconds: number;
}

/**
 * Session tokens (../../../../docs/interaction.md, Identity): the person,
 * limited to the session's project and to reading, with Hephaestus as the
 * actor (Pistis's token exchange). `ForbiddenException` when Pistis refuses
 * the person (no longer in the project), 503 when it can't be reached.
 */
export abstract class SessionTokens {
  abstract issue(request: SessionTokenRequest): Promise<string>;
}

export interface PistisSessionTokensOptions {
  /** Pistis's issuer; the token endpoint is discovered from it. */
  issuer: string;
  /** Hephaestus's own client (`token_exchange: ['session-token']`). */
  clientId: string;
  clientSecret: string;
  timeoutMs?: number;
}

/** Pistis's answers that mean "not this person", not "try again". */
const REFUSALS = new Set(['invalid_grant', 'invalid_target']);

export class PistisSessionTokens extends SessionTokens {
  private tokenEndpoint: string | undefined;

  constructor(private readonly options: PistisSessionTokensOptions) {
    super();
  }

  async issue(request: SessionTokenRequest): Promise<string> {
    let response: Response;
    try {
      response = await fetch(await this.endpoint(), {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${Buffer.from(
            `${encodeURIComponent(this.options.clientId)}:${encodeURIComponent(this.options.clientSecret)}`,
          ).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          subject_token: request.userToken,
          subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
          project_id: request.projectId,
          session_id: request.sessionId,
          agent_id: request.agentId,
          agent_version_id: request.agentVersionId,
          expires_in: String(request.expiresInSeconds),
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000),
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        `Pistis could not be reached for a session token: ${String(error)}`,
      );
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        error_description?: string;
      };
      const detail = `${body.error ?? response.status}${body.error_description ? `: ${body.error_description}` : ''}`;
      if (body.error && REFUSALS.has(body.error)) {
        throw new ForbiddenException(
          `Pistis refused a session token (${detail}).`,
        );
      }
      throw new ServiceUnavailableException(
        `Pistis answered ${response.status} to the session token request (${detail}).`,
      );
    }
    return ((await response.json()) as { access_token: string }).access_token;
  }

  private async endpoint(): Promise<string> {
    if (!this.tokenEndpoint) {
      const discovery = `${this.options.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
      let response: Response;
      try {
        response = await fetch(discovery, {
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000),
        });
      } catch (error) {
        throw new ServiceUnavailableException(
          `Pistis could not be reached for a session token: ${String(error)}`,
        );
      }
      if (!response.ok) {
        throw new ServiceUnavailableException(
          `${discovery} answered ${response.status}`,
        );
      }
      this.tokenEndpoint = (
        (await response.json()) as { token_endpoint: string }
      ).token_endpoint;
    }
    return this.tokenEndpoint;
  }
}
