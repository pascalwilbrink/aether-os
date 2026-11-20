import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import { costOf, type CallTokens, type CatalogEntry } from '@pylon/catalog';
import type { ApiTypes } from '@pylon/core';
import type { KeySource } from '@pylon/keys';

import type { CallContext } from './call-context.js';
import { ModelCallEntity } from './model-call.entity.js';

/** One call to record, after it ended (or failed). */
export interface RecordedCall {
  kind: 'chat' | 'embedding';
  provider: string;
  model: string;
  keySource: KeySource;
  /** The catalogue's price in force when the call was made; null: unpriced. */
  price: CatalogEntry['price'];
  tokens: CallTokens;
  finishReason: string | null;
}

/** What `spent` sums: one budget's calls. */
export type SpendScope =
  | { organizationId: string }
  | { projectId: string }
  | { agentId: string }
  | { taskTreeId: string };

export interface UsageFilters {
  projectId?: string;
  agentId?: string;
  taskTreeId?: string;
  executionIds?: string[];
  from?: Date;
  to?: Date;
  groupBy?: ApiTypes.UsageGroup;
}

/** The column each `groupBy` groups on. */
const GROUPS: Record<ApiTypes.UsageGroup, string> = {
  project: 'call.project_id::text',
  agent: 'call.agent_id::text',
  task_tree: 'call.task_tree_id::text',
  execution: 'call.execution_id::text',
  model: `call.provider || '/' || call.model`,
};

/**
 * Metering (docs/models.md, Metering): every call through Pylon is a row in
 * `model_calls`, priced at the catalogue's price when it was made. Budgets
 * sum it; the usage API totals it.
 */
@Injectable()
export class ModelCallsService {
  constructor(
    @InjectRepository(ModelCallEntity)
    private readonly calls: Repository<ModelCallEntity>,
  ) {}

  async record(
    context: CallContext,
    call: RecordedCall,
    at = new Date(),
  ): Promise<{ costUsd: string | null }> {
    const tokens = {
      inputTokens: whole(call.tokens.inputTokens),
      outputTokens: whole(call.tokens.outputTokens),
      cacheReadTokens: whole(call.tokens.cacheReadTokens),
      cacheWriteTokens: whole(call.tokens.cacheWriteTokens),
    };
    const costUsd = call.price ? costOf(call.price, tokens) : null;
    await this.calls.insert({
      id: uuidv7(),
      ...context,
      kind: call.kind,
      provider: call.provider,
      model: call.model,
      keySource: call.keySource,
      ...tokens,
      costUsd,
      priceId: call.price?.id ?? null,
      finishReason: call.finishReason,
      createdAt: at,
    });
    return { costUsd };
  }

  /**
   * What a budget's calls cost (US dollars, 6 decimals) from `since` (all
   * of them when null). Unpriced calls count as nothing.
   */
  async spent(scope: SpendScope, since: Date | null): Promise<string> {
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

  /** Totals of an organization's calls, filtered, per group or in one. */
  async usage(
    organizationId: string,
    filters: UsageFilters,
  ): Promise<ApiTypes.UsageResponse> {
    const query = this.calls
      .createQueryBuilder('call')
      .select(filters.groupBy ? GROUPS[filters.groupBy] : 'NULL::text', 'group')
      .addSelect('count(*)::int', 'modelCalls')
      .addSelect('coalesce(sum(call.inputTokens), 0)::bigint', 'inputTokens')
      .addSelect('coalesce(sum(call.outputTokens), 0)::bigint', 'outputTokens')
      .addSelect(
        'coalesce(sum(call.cacheReadTokens), 0)::bigint',
        'cacheReadTokens',
      )
      .addSelect(
        'coalesce(sum(call.cacheWriteTokens), 0)::bigint',
        'cacheWriteTokens',
      )
      // Null when no call had a price.
      .addSelect('sum(call.costUsd)::numeric(18, 6)::text', 'costUsd')
      .where('call.organizationId = :organizationId', { organizationId });
    if (filters.projectId) {
      query.andWhere('call.projectId = :projectId', {
        projectId: filters.projectId,
      });
    }
    if (filters.agentId) {
      query.andWhere('call.agentId = :agentId', { agentId: filters.agentId });
    }
    if (filters.taskTreeId) {
      query.andWhere('call.taskTreeId = :taskTreeId', {
        taskTreeId: filters.taskTreeId,
      });
    }
    if (filters.executionIds?.length) {
      query.andWhere('call.executionId IN (:...executionIds)', {
        executionIds: filters.executionIds,
      });
    }
    if (filters.from) {
      query.andWhere('call.createdAt >= :from', { from: filters.from });
    }
    if (filters.to) {
      query.andWhere('call.createdAt < :to', { to: filters.to });
    }
    if (filters.groupBy) {
      query.groupBy('1');
    }
    const rows = (await query
      .orderBy('"costUsd"', 'DESC', 'NULLS LAST')
      .addOrderBy('1')
      .getRawMany()) as (Omit<
      ApiTypes.UsageItem,
      'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'
    > &
      Record<
        'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens',
        string
      >)[];
    return {
      items: rows
        // Without groupBy, no calls is still one item of zeros.
        .map((row) => ({
          ...row,
          inputTokens: Number(row.inputTokens),
          outputTokens: Number(row.outputTokens),
          cacheReadTokens: Number(row.cacheReadTokens),
          cacheWriteTokens: Number(row.cacheWriteTokens),
        })),
    };
  }
}

function whole(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}
