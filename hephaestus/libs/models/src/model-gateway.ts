import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { MastraModelConfig } from '@mastra/core/llm';
import { In, type Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import { SecretStore, type ApiTypes, type Env } from '@hephaestus/core';

import { LanguageModels } from './language-models.js';
import { ModelCallEntity, type KeySource } from './model-call.entity.js';
import {
  ModelCatalogService,
  type CatalogEntry,
} from './model-catalog.service.js';
import { costOf } from './model-cost.js';
import { modelKeyPath } from './model-keys.service.js';
import { ModelKeyMissingError, ModelRetiredError } from './model.errors.js';

/** Who a model call is for: every call is attributed (docs/models.md). */
export interface ModelCallContext {
  organizationId: string;
  projectId: string;
  taskId: string;
  /** The task tree it's part of (budgets: docs/models.md). */
  topLevelTaskId: string;
  /** The agent: its own provider key comes first. */
  agentId: string;
  executionId: string;
  agentVersionId: string;
}

export interface ResolvedModel {
  /** What Mastra calls: the provider's model with the key the gateway picked. */
  model: MastraModelConfig;
  provider: string;
  modelId: string;
  keySource: KeySource;
  /** The catalogue's price in force when resolved; null: calls aren't priced. */
  price: CatalogEntry['price'];
}

/** One call's usage, as Mastra reports it (input includes cache reads and writes). */
export interface ModelCallUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
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
    private readonly catalog: ModelCatalogService,
  ) {}

  /**
   * The model to call for an agent version, with the catalogue's price in
   * force now (a model outside the catalogue, from a version older than it,
   * is called unpriced). Throws `ModelRetiredError` for a retired model,
   * `ModelKeyMissingError` when there's no key, and
   * `SecretStoreUnavailableError` when OpenBao can't answer.
   */
  async resolve(
    context: ModelCallContext,
    configuration: ApiTypes.AgentModelConfiguration,
  ): Promise<ResolvedModel> {
    const { provider, model: modelId } = configuration;
    if (!PROVIDER.test(provider)) {
      throw new ModelKeyMissingError(provider);
    }
    const entry = await this.catalog.entryFor(provider, modelId, new Date());
    if (entry?.status === 'retired') {
      throw new ModelRetiredError(provider, modelId);
    }
    const key = await this.keyFor(context, provider);
    return {
      model: this.languageModels.create(`${provider}/${modelId}`, key.apiKey),
      provider,
      modelId,
      keySource: key.source,
      price: entry?.price ?? null,
    };
  }

  /**
   * Records one call (one step of the agent loop), priced at the price
   * resolved with the model: a run that spans a price change keeps one price.
   */
  async record(
    context: ModelCallContext,
    resolved: ResolvedModel,
    usage: ModelCallUsage,
  ): Promise<void> {
    const counted = {
      inputTokens: tokens(usage.inputTokens),
      outputTokens: tokens(usage.outputTokens),
      cacheReadTokens: tokens(usage.cacheReadTokens),
      cacheWriteTokens: tokens(usage.cacheWriteTokens),
    };
    await this.calls.insert({
      id: uuidv7(),
      ...context,
      provider: resolved.provider,
      model: resolved.modelId,
      keySource: resolved.keySource,
      ...counted,
      costUsd: resolved.price ? costOf(resolved.price, counted) : null,
      priceId: resolved.price?.id ?? null,
      finishReason: usage.finishReason ?? null,
      createdAt: new Date(),
    });
  }

  /**
   * What calls cost in total (US dollars, 6 decimals): an organization's, a
   * project's or a task tree's, from `since` (all of them when null).
   * Unpriced calls count as nothing.
   */
  async spent(
    scope:
      | { organizationId: string }
      | { projectId: string }
      | { topLevelTaskId: string },
    since: Date | null,
  ): Promise<string> {
    const query = this.calls
      .createQueryBuilder('call')
      .select('coalesce(sum(call.costUsd), 0)::numeric(18, 6)::text', 'spent')
      .where(scope);
    if (since) {
      query.andWhere('call.createdAt >= :since', { since });
    }
    const row = (await query.getRawOne()) as { spent: string } | undefined;
    return row?.spent ?? '0.000000';
  }

  /** Calls, tokens and cost per execution. */
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
      .addSelect(
        'coalesce(sum(call.cacheReadTokens), 0)::int',
        'cacheReadTokens',
      )
      .addSelect(
        'coalesce(sum(call.cacheWriteTokens), 0)::int',
        'cacheWriteTokens',
      )
      // Null when no call had a price.
      .addSelect('sum(call.costUsd)::numeric(14, 6)::text', 'costUsd')
      .where({ executionId: In(executionIds) })
      .groupBy('call.executionId')
      .getRawMany()) as ({ executionId: string } & ApiTypes.ExecutionUsage)[];
    for (const { executionId, ...totals } of rows) {
      usage.set(executionId, totals);
    }
    return usage;
  }

  /** The agent's own key, else the organization's, else the platform's if allowed. */
  private async keyFor(
    { organizationId, agentId }: ModelCallContext,
    provider: string,
  ): Promise<{ apiKey: string; source: KeySource }> {
    const agents = apiKeyOf(
      await this.secrets.read(modelKeyPath(organizationId, provider, agentId)),
    );
    if (agents) {
      return { apiKey: agents, source: 'agent' };
    }
    const own = apiKeyOf(
      await this.secrets.read(modelKeyPath(organizationId, provider)),
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
