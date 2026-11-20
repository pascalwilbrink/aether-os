import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  createHephaestusHttpClient,
  fetchFailure,
  HephaestusApi,
  ServiceTokens,
} from '@agora/core';

import {
  AgentVersionChecker,
  type AgentVersionChoices,
} from './agent-version-checker.js';
import { AgentVersionChoiceError } from './agent.errors.js';

export const HEPHAESTUS_CLIENT_OPTIONS = Symbol('HEPHAESTUS_CLIENT_OPTIONS');

export interface HephaestusClientOptions {
  baseUrl: string;
  /** Per request; docs/engineering.md's default is 5 seconds. */
  timeoutMs?: number;
}

/** The codes Hephaestus refuses a version's choices with. */
const CHOICE_CODES = new Set([
  'MODEL_NOT_AVAILABLE',
  'TOOL_SERVER_INVALID',
  'SKILL_INVALID',
]);

/**
 * `AgentVersionChecker` over Hephaestus's `checkAgentVersion`, with the
 * client generated from its spec and Agora's own token (`platform:read`).
 * A 409 becomes the same error here; anything else Hephaestus answers, or
 * not answering at all, is `503`. The check changes nothing, so a network
 * error is retried once, and a refused token once with a fresh one.
 */
@Injectable()
export class HttpAgentVersionChecker extends AgentVersionChecker {
  private readonly logger = new Logger(HttpAgentVersionChecker.name);
  private readonly client: ReturnType<typeof createHephaestusHttpClient>;

  constructor(
    @Inject(HEPHAESTUS_CLIENT_OPTIONS) options: HephaestusClientOptions,
    private readonly tokens: ServiceTokens,
  ) {
    super();
    const timeoutMs = options.timeoutMs ?? 5000;
    this.client = createHephaestusHttpClient({
      baseUrl: options.baseUrl,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) }),
      auth: () => tokens.token(),
    });
  }

  async assertChoosable(
    organizationId: string,
    choices: AgentVersionChoices,
  ): Promise<void> {
    let refreshed = false;
    for (let attempt = 1; ; attempt++) {
      let response: Response | undefined;
      let error: unknown;
      try {
        ({ response, error } = await HephaestusApi.checkAgentVersion({
          client: this.client,
          path: { organizationId },
          body: {
            model: choices.model,
            tools: choices.tools,
            skills: choices.skills,
          },
        }));
      } catch (cause) {
        if (attempt < 2) {
          continue;
        }
        throw this.unavailable(fetchFailure(cause));
      }
      if (response?.ok) {
        return;
      }
      if (response?.status === 401 && !refreshed) {
        refreshed = true;
        attempt--;
        this.tokens.invalidate();
        continue;
      }
      const problem = error as { code?: unknown; detail?: unknown } | undefined;
      if (
        response?.status === 409 &&
        typeof problem?.code === 'string' &&
        CHOICE_CODES.has(problem.code)
      ) {
        throw new AgentVersionChoiceError(
          typeof problem.detail === 'string'
            ? problem.detail
            : 'Hephaestus refused the version.',
          problem.code,
        );
      }
      // Generated clients return a failed fetch as an error without a response.
      if (!response && attempt < 2) {
        continue;
      }
      throw this.unavailable(
        response ? `HTTP ${response.status}` : fetchFailure(error),
      );
    }
  }

  private unavailable(reason: string): ServiceUnavailableException {
    this.logger.warn(`Hephaestus couldn't check a version: ${reason}`);
    return new ServiceUnavailableException(
      'Hephaestus, which checks a version’s model, tools and skills, is unavailable',
    );
  }
}
