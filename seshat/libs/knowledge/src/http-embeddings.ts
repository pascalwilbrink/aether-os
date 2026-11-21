import { Logger } from '@nestjs/common';

import {
  createPylonHttpClient,
  fetchFailure,
  PylonApi,
  ServiceTokens,
} from '@seshat/core';

import { Embeddings, EmbeddingsError } from './embeddings.js';

export interface PylonClientOptions {
  baseUrl: string;
  /** `<provider>/<model>` of Pylon's catalogue. */
  model: string;
  /** Per request: embedding a batch can take a while. */
  timeoutMs?: number;
}

/** Statuses that mean the configuration has to change, not the moment. */
const FOR_GOOD = new Set([400, 403, 404, 409]);

/**
 * `Embeddings` over Pylon's `createEmbeddings` (`POST …/projects/{id}/
 * embeddings`, purpose `knowledge`), with the generated client and Seshat's
 * own token (`model:invoke`). A refused token is renewed once. Pylon
 * refusing for good (no key, an unknown model, 400/403/404/409) isn't
 * retryable; a budget that ran out (402), 5xx and no answer are.
 */
export class HttpEmbeddings extends Embeddings {
  private readonly logger = new Logger(HttpEmbeddings.name);
  private readonly client: ReturnType<typeof createPylonHttpClient>;
  readonly model: string;
  private readonly provider: string;
  private readonly modelId: string;

  constructor(
    options: PylonClientOptions,
    private readonly tokens: ServiceTokens,
  ) {
    super();
    const timeoutMs = options.timeoutMs ?? 30_000;
    this.model = options.model;
    const slash = options.model.indexOf('/');
    this.provider = options.model.slice(0, slash);
    this.modelId = options.model.slice(slash + 1);
    this.client = createPylonHttpClient({
      baseUrl: options.baseUrl,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) }),
      auth: () => tokens.token(),
    });
  }

  async embed(
    organizationId: string,
    projectId: string,
    texts: string[],
  ): Promise<number[][]> {
    let refreshed = false;
    for (;;) {
      let result: Awaited<ReturnType<typeof PylonApi.createEmbeddings>>;
      try {
        result = await PylonApi.createEmbeddings({
          client: this.client,
          path: { organizationId, projectId },
          headers: { 'X-Aether-Purpose': 'knowledge' },
          body: {
            provider: this.provider as PylonApi.ModelProvider,
            model: this.modelId,
            input: texts,
          },
        });
      } catch (error) {
        throw this.failed(fetchFailure(error), true);
      }
      const { data, error, response } = result;
      if (!response) {
        // The generated client returns a failed fetch as `error`.
        throw this.failed(fetchFailure(error), true);
      }
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        this.tokens.invalidate();
        continue;
      }
      if (response.ok && data) {
        const vectors = [...data.data]
          .sort((a, b) => a.index - b.index)
          .map((entry) => entry.embedding);
        if (vectors.length !== texts.length) {
          throw this.failed(
            `Pylon returned ${vectors.length} vectors for ${texts.length} texts`,
            true,
          );
        }
        return vectors;
      }
      const problem = (error ?? {}) as { code?: string; detail?: string };
      const reason = `Pylon answered ${response.status}${problem.code ? ` ${problem.code}` : ''}${problem.detail ? `: ${problem.detail}` : ''}`;
      throw this.failed(reason, !FOR_GOOD.has(response.status));
    }
  }

  private failed(reason: string, retryable: boolean): EmbeddingsError {
    this.logger.warn(`Embedding failed: ${reason}`);
    return new EmbeddingsError(reason, retryable);
  }
}
