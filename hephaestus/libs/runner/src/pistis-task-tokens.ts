import { RunnerFailure } from './runner.errors.js';
import { TaskTokens, type TaskTokenRequest } from './task-tokens.js';

export interface PistisTaskTokensOptions {
  /** Pistis's issuer; the token endpoint is discovered from it. */
  issuer: string;
  /** Hephaestus's own client (`token_exchange: ['task-token']`). */
  clientId: string;
  clientSecret: string;
  timeoutMs?: number;
}

/** Pistis's answers that mean "not this service account", not "try again". */
const REFUSALS = new Set(['invalid_grant', 'invalid_target']);

/**
 * Task tokens from Pistis's token exchange (`pistis/CLAUDE.md`, Token
 * exchange): Hephaestus authenticates as its own client and asks for the
 * service account, limited to the project, carrying the task.
 */
export class PistisTaskTokens extends TaskTokens {
  private tokenEndpoint: string | undefined;

  constructor(private readonly options: PistisTaskTokensOptions) {
    super();
  }

  async issue(request: TaskTokenRequest): Promise<string> {
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
          subject_token: request.serviceAccountId,
          subject_token_type: 'urn:aether-os:token-type:service-account',
          project_id: request.projectId,
          task_id: request.taskId,
          ...(request.taskTreeId ? { task_tree_id: request.taskTreeId } : {}),
          ...(request.agentId ? { agent_id: request.agentId } : {}),
          ...(request.agentVersionId
            ? { agent_version_id: request.agentVersionId }
            : {}),
          expires_in: String(request.expiresInSeconds),
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000),
      });
    } catch (error) {
      throw new RunnerFailure(
        `Pistis could not be reached for a task token: ${String(error)}`,
        'infrastructure',
      );
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        error_description?: string;
      };
      const detail = `${body.error ?? response.status}${body.error_description ? `: ${body.error_description}` : ''}`;
      if (body.error && REFUSALS.has(body.error)) {
        throw new RunnerFailure(
          `Pistis refused a task token for service account ${request.serviceAccountId} (${detail})`,
          'access_denied',
        );
      }
      // Hephaestus's own client is misconfigured (4xx): retrying won't help.
      throw new RunnerFailure(
        `Pistis answered ${response.status} to the task token request (${detail})`,
        'infrastructure',
        response.status >= 500,
      );
    }

    const { access_token: token } = (await response.json()) as {
      access_token: string;
    };
    // The service account must belong to the task's organization: Pistis
    // only knows the account's own organization.
    if (claimsOf(token)['org_id'] !== request.organizationId) {
      throw new RunnerFailure(
        `Service account ${request.serviceAccountId} doesn't belong to organization ${request.organizationId}`,
        'access_denied',
      );
    }
    return token;
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

/** A JWT's claims, unverified: Pistis just issued it over TLS. */
function claimsOf(token: string): Record<string, unknown> {
  try {
    return JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
  } catch {
    return {};
  }
}
