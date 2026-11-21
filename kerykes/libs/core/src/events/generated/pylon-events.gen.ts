// This file is generated from pylon.asyncapi.yaml by aether-asyncapi-types
// (@aether-os/contracts). Do not edit it by hand; run `pnpm generate:api`.

/**
 * Payload of `budget.changed`.
 */
export interface BudgetChanged {
  budgetId: string;
  scope: 'organization' | 'project' | 'agent' | 'task_tree';
  scopeId: string;
  /**
   * US dollars, 6 decimals; null for no limit.
   */
  limitUsd: string | null;
}

/**
 * Payload of `budget.exhausted`.
 */
export interface BudgetExhausted {
  budgetId: string;
  scope: 'organization' | 'project' | 'agent' | 'task_tree';
  scopeId: string;
  /**
   * US dollars
   */
  limitUsd: string;
  /**
   * US dollars
   */
  spentUsd: string;
  /**
   * The month it's for; null for a task tree's (its lifetime).
   */
  windowStart: string | null;
}

/**
 * Payload of `budget.threshold-reached`.
 */
export interface BudgetThresholdReached {
  budgetId: string;
  scope: 'organization' | 'project' | 'agent' | 'task_tree';
  scopeId: string;
  /**
   * US dollars
   */
  limitUsd: string;
  /**
   * US dollars
   */
  spentUsd: string;
  /**
   * The month it's for; null for a task tree's (its lifetime).
   */
  windowStart: string | null;
}

/** Every Pylon event type, mapped to its payload. */
export interface PylonEventPayloads {
  'budget.changed': BudgetChanged;
  'budget.exhausted': BudgetExhausted;
  'budget.threshold-reached': BudgetThresholdReached;
}

export type PylonEventType = keyof PylonEventPayloads;

/** Every Pylon event type in the spec. */
export const PYLON_EVENT_TYPES = [
  'budget.changed',
  'budget.exhausted',
  'budget.threshold-reached',
] as const satisfies readonly PylonEventType[];
