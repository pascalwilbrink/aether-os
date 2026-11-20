import { Logger, ServiceUnavailableException } from '@nestjs/common';

import {
  createPylonHttpClient,
  fetchFailure,
  PylonApi,
  ServiceTokens,
} from '@agora/core';

import { AgentVersionChoiceError } from './agent.errors.js';

export interface PylonClientOptions {
  baseUrl: string;
  /** Per request; docs/engineering.md's default is 5 seconds. */
  timeoutMs?: number;
}

/**
 * Providers whose models aren't in the catalogue: an organization's own
 * server (Ollama) may run any model.
 */
const SELF_HOSTED = new Set(['ollama']);

/**
 * Whether a version's model can be chosen: an `active` chat model of
 * Pylon's catalogue (`GET /v1/models?provider=&model=`, with Agora's own
 * token; ../docs/pylon.md). `MODEL_NOT_AVAILABLE` otherwise; a provider
 * Pylon can't call (its `400`) too. No answer, or another status, is
 * `503`. A network error is retried once, a refused token once with a
 * fresh one.
 */
export class HttpModelChecker {
  private readonly logger = new Logger(HttpModelChecker.name);
  private readonly client: ReturnType<typeof createPylonHttpClient>;

  constructor(
    options: PylonClientOptions,
    private readonly tokens: ServiceTokens,
  ) {
    const timeoutMs = options.timeoutMs ?? 5000;
    this.client = createPylonHttpClient({
      baseUrl: options.baseUrl,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) }),
      auth: () => tokens.token(),
    });
  }

  async assertAvailable(model: {
    provider: string;
    model: string;
  }): Promise<void> {
    if (SELF_HOSTED.has(model.provider)) {
      return;
    }
    const notAvailable = new AgentVersionChoiceError(
      `Model ${model.provider}/${model.model} isn't an active model of the catalogue.`,
      'MODEL_NOT_AVAILABLE',
    );
    let refreshed = false;
    for (let attempt = 1; ; attempt++) {
      let result: Awaited<ReturnType<typeof PylonApi.listModels>>;
      try {
        result = await PylonApi.listModels({
          client: this.client,
          query: {
            provider: model.provider as PylonApi.ModelProvider,
            model: model.model,
          },
        });
      } catch (cause) {
        if (attempt < 2) continue;
        throw this.unavailable(fetchFailure(cause));
      }
      const { data, error, response } = result;
      if (!response) {
        // The generated client returns a failed fetch as `error`.
        if (attempt < 2) continue;
        throw this.unavailable(fetchFailure(error));
      }
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        attempt--;
        this.tokens.invalidate();
        continue;
      }
      if (response.status === 400) {
        // A provider Pylon doesn't know.
        throw notAvailable;
      }
      if (!response.ok || !data) {
        throw this.unavailable(`HTTP ${response.status}`);
      }
      const found = data.items.find(
        (entry) =>
          entry.provider === model.provider && entry.model === model.model,
      );
      if (found?.status !== 'active' || found.kind !== 'chat') {
        throw notAvailable;
      }
      return;
    }
  }

  private unavailable(reason: string): ServiceUnavailableException {
    this.logger.warn(`Pylon couldn't check a version's model: ${reason}`);
    return new ServiceUnavailableException(
      'Pylon, whose catalogue a version’s model is checked against, is unavailable',
    );
  }
}
