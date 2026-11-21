import { ServiceUnavailableException } from '@nestjs/common';

import type { ApiTypes } from '@hephaestus/core';

export type BudgetScope = ApiTypes.BudgetScope;

/**
 * A budget that applies to the task ran out (Pylon's budget check, or its
 * `402 BUDGET_EXHAUSTED` on a call): the execution pauses.
 */
export class BudgetExceededError extends Error {
  constructor(
    readonly scope: BudgetScope,
    readonly scopeId: string | null = null,
  ) {
    super(`The ${scope.replace('_', ' ')} budget ran out`);
    this.name = 'BudgetExceededError';
  }
}

/** Pylon didn't answer, or not as it should (`503`). */
export class PylonUnavailableError extends ServiceUnavailableException {
  constructor(reason: string) {
    super(`Pylon is unavailable: ${reason}`);
    this.name = 'PylonUnavailableError';
  }
}
