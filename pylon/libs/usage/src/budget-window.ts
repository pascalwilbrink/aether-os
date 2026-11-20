import type { BudgetScope } from './budget.entity.js';

/** At this share of a limit, `budget.threshold-reached` is published. */
export const THRESHOLD_PERCENT = 80;

export interface BudgetWindow {
  /** Calls from here count; null: all of them (a task tree's life). */
  start: Date | null;
  /** Names the window (`2026-11`, `lifetime`), for announcing a threshold once. */
  key: string;
}

/**
 * The window a budget counts over (docs/models.md, Budgets): the calendar
 * month in UTC for an organization's, a project's or an agent's, the whole life of a
 * task tree's.
 */
export function windowOf(scope: BudgetScope, at: Date): BudgetWindow {
  if (scope === 'task_tree') {
    return { start: null, key: 'lifetime' };
  }
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  return { start, key: start.toISOString().slice(0, 7) };
}

/** Whether `spent` reached the share `percent` of `limit` (millionths of a dollar). */
export const reached = (spent: bigint, limit: bigint, percent = 100) =>
  spent * 100n >= limit * BigInt(percent);
