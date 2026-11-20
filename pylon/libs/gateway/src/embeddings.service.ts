import { Inject, Injectable } from '@nestjs/common';

import { ModelNotAvailableError } from '@pylon/catalog';
import { ProblemException, type ApiTypes } from '@pylon/core';
import type { CallContext } from '@pylon/usage';

import { ModelGateway, providerUnavailable } from './model-gateway.js';
import type { ProviderUrls } from './provider-apis.js';
import { ProviderClient, ProviderUnreachableError } from './provider-client.js';
import { PROVIDER_URLS } from './pass-through.service.js';

/** Providers whose embeddings Pylon calls: OpenAI's API and those that follow it. */
const EMBEDDING_PROVIDERS = ['openai', 'mistral', 'ollama'];

interface OpenAiEmbeddings {
  data?: { index?: number; embedding?: number[] }[];
  usage?: { prompt_tokens?: number };
}

/**
 * Embeddings (docs/pylon.md, Embeddings): texts in, vectors out, with the
 * catalogue's `embedding` models, through the same checks, keys and
 * metering as every call. A provider's refusal is a `502` saying what it
 * answered (never the key or the inputs).
 */
@Injectable()
export class EmbeddingsService {
  constructor(
    private readonly gateway: ModelGateway,
    private readonly client: ProviderClient,
    @Inject(PROVIDER_URLS) private readonly urls: ProviderUrls,
  ) {}

  async embed(
    context: CallContext,
    request: ApiTypes.EmbeddingsRequest,
  ): Promise<ApiTypes.EmbeddingsResponse> {
    const { provider, model, input } = request;
    if (!EMBEDDING_PROVIDERS.includes(provider)) {
      throw new ModelNotAvailableError(provider, model);
    }
    const prepared = await this.gateway.prepare(
      context,
      'embedding',
      provider,
      model,
    );
    const { apiKey, baseUrl } = prepared.key.settings;
    const base =
      provider === 'ollama'
        ? (baseUrl ?? '')
        : provider === 'mistral'
          ? this.urls.mistral
          : this.urls.openai;
    let answer: Response;
    try {
      answer = await this.client.send(
        {
          url: `${base.replace(/\/+$/, '')}/v1/embeddings`,
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            input,
            encoding_format: 'float',
            ...(request.dimensions && provider === 'openai'
              ? { dimensions: request.dimensions }
              : {}),
          }),
        },
        {
          selfHosted: provider === 'ollama',
          signal: new AbortController().signal,
        },
      );
    } catch (error) {
      if (error instanceof ProviderUnreachableError) {
        throw providerUnavailable(error.message);
      }
      throw error;
    }
    if (!answer.ok) {
      throw new ProblemException(
        502,
        'PROVIDER_REFUSED',
        `${provider} answered ${answer.status}: ${(await answer.text()).slice(0, 300)}`,
      );
    }
    const body = (await answer.json()) as OpenAiEmbeddings;
    const data = (body.data ?? [])
      .map((item, position) => ({
        index: item.index ?? position,
        embedding: item.embedding ?? [],
      }))
      .sort((a, b) => a.index - b.index);
    if (
      data.length !== input.length ||
      data.some((item) => item.embedding.length === 0)
    ) {
      throw new ProblemException(
        502,
        'PROVIDER_REFUSED',
        `${provider} returned ${data.length} embeddings for ${input.length} inputs.`,
      );
    }
    const inputTokens =
      typeof body.usage?.prompt_tokens === 'number'
        ? body.usage.prompt_tokens
        : null;
    const { costUsd } = await this.gateway.finish(context, prepared, {
      tokens: {
        inputTokens,
        outputTokens: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
      },
      finishReason: 'stop',
    });
    return {
      provider,
      model,
      dimensions: data[0].embedding.length,
      data,
      usage: { inputTokens, costUsd },
    };
  }
}
