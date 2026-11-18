import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { MastraModelConfig } from '@mastra/core/llm';
import { In, type Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import { SecretStore, type ApiTypes, type Env } from '@hephaestus/core';

import { LanguageModels } from './language-models.js';
import { ModelCallEntity, type KeySource } from './model-call.entity.js';
import { ModelKeyMissingError } from './model.errors.js';

/** Who a model call is for: every call is attributed (docs/models.md). */
export interface ModelCallContext {
  organizationId: string;
  projectId: string;
  taskId: string;
  executionId: string;
  agentVersionId: string;
}

export interface ResolvedModel {
  /** What Mastra calls: the provider's model with the key the gateway picked. */
  model: MastraModelConfig;
  provider: string;
  modelId: string;
  keySource: KeySource;
}

export interface ModelCallUsage {
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
}

/** A provider name that's safe in a secret path (`anthropic`, `openai`, …). */
const PROVIDER = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * The model gateway (docs/models.md): the one place that turns an agent
 * version's model into something callable, with a provider key from
 * OpenBao (the organization's own, else the platform's if allowed), and
 * that meters every call. Policy and budgets come later; keys never leave
 * Hephaestus's process (not to the agent's context, not to a sandbox).
 */
@Injectable()
export class ModelGateway {
  constructor(
    @InjectRepository(ModelCallEntity)
    private readonly calls: Repository<ModelCallEntity>,
    private readonly secrets: SecretStore,
    private readonly languageModels: LanguageModels,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * The model to call for an agent version. Throws `ModelKeyMissingError`
   * when there's no key, and `SecretStoreUnavailableError` when OpenBao
   * can't answer.
   */
  async resolve(
    context: ModelCallContext,
    configuration: ApiTypes.AgentModelConfiguration,
  ): Promise<ResolvedModel> {
    const { provider, model: modelId } = configuration;
    if (!PROVIDER.test(provider)) {
      throw new ModelKeyMissingError(provider);
    }
    const key = await this.keyFor(context.organizationId, provider);
    return {
      model: this.languageModels.create(`${provider}/${modelId}`, key.apiKey),
      provider,
      modelId,
      keySource: key.source,
    };
  }

  /** Records one call (one step of the agent loop). */
  async record(
    context: ModelCallContext,
    resolved: ResolvedModel,
    usage: ModelCallUsage,
  ): Promise<void> {
    await this.calls.insert({
      id: uuidv7(),
      ...context,
      provider: resolved.provider,
      model: resolved.modelId,
      keySource: resolved.keySource,
      inputTokens: tokens(usage.inputTokens),
      outputTokens: tokens(usage.outputTokens),
      costUsd: null,
      finishReason: usage.finishReason ?? null,
      createdAt: new Date(),
    });
  }

  /** Calls and tokens per execution. */
  async usageOf(
    executionIds: string[],
  ): Promise<Map<string, ApiTypes.ExecutionUsage>> {
    const usage = new Map<string, ApiTypes.ExecutionUsage>();
    if (executionIds.length === 0) {
      return usage;
    }
    const rows = (await this.calls
      .createQueryBuilder('call')
      .select('call.executionId', 'executionId')
      .addSelect('count(*)::int', 'modelCalls')
      .addSelect('coalesce(sum(call.inputTokens), 0)::int', 'inputTokens')
      .addSelect('coalesce(sum(call.outputTokens), 0)::int', 'outputTokens')
      .where({ executionId: In(executionIds) })
      .groupBy('call.executionId')
      .getRawMany()) as ({ executionId: string } & ApiTypes.ExecutionUsage)[];
    for (const { executionId, ...totals } of rows) {
      usage.set(executionId, totals);
    }
    return usage;
  }

  private async keyFor(
    organizationId: string,
    provider: string,
  ): Promise<{ apiKey: string; source: KeySource }> {
    const own = apiKeyOf(
      await this.secrets.read(`orgs/${organizationId}/llm/${provider}`),
    );
    if (own) {
      return { apiKey: own, source: 'organization' };
    }
    if (this.config.get('PLATFORM_MODEL_KEYS', { infer: true })) {
      const platform = apiKeyOf(
        await this.secrets.read(`platform/llm/${provider}`),
      );
      if (platform) {
        return { apiKey: platform, source: 'platform' };
      }
    }
    throw new ModelKeyMissingError(provider);
  }
}

/** A provider key is stored as `{ apiKey }`. */
function apiKeyOf(secret: Record<string, unknown> | null): string | null {
  const apiKey = secret?.['apiKey'];
  return typeof apiKey === 'string' && apiKey.length > 0 ? apiKey : null;
}

function tokens(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value)
    : null;
}
