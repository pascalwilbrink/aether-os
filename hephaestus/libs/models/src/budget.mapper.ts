import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ApiTypes } from '@hephaestus/core';

import { THRESHOLD_PERCENT, type BudgetWindow } from './budget-window.js';
import { BudgetEntity, type BudgetScope } from './budget.entity.js';
import { fromMicros, toMicros } from './model-cost.js';

@Injectable()
export class BudgetMapper {
  /** A budget not set yet (no limit); its ID (UUIDv7) is generated here. */
  toEntity(
    owner: { organizationId: string; projectId: string | null },
    scope: BudgetScope,
    scopeId: string,
    now: Date,
  ): BudgetEntity {
    return Object.assign(new BudgetEntity(), {
      id: uuidv7(),
      organizationId: owner.organizationId,
      projectId: owner.projectId,
      scope,
      scopeId,
      limitUsd: null,
      thresholdWindow: null,
      version: 0,
      updatedBy: '',
      createdAt: now,
      updatedAt: now,
    } satisfies BudgetEntity);
  }

  /** A budget (or none set: no limit) with what its window spent. */
  toResponse(
    scope: BudgetScope,
    scopeId: string,
    budget: BudgetEntity | null,
    spentUsd: string,
    window: BudgetWindow,
  ): ApiTypes.BudgetResponse {
    return {
      scope,
      scopeId,
      limitUsd: budget?.limitUsd ? decimal(budget.limitUsd) : null,
      spentUsd: decimal(spentUsd),
      windowStart: window.start?.toISOString() ?? null,
      thresholdPercent: THRESHOLD_PERCENT,
      updatedAt:
        budget && budget.version > 0 ? budget.updatedAt.toISOString() : null,
    };
  }
}

/** Always 6 decimals, as the API returns money. */
const decimal = (value: string) => fromMicros(toMicros(value));
