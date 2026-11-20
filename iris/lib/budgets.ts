import type { ApiSchema } from "./api";
import { formatCost } from "./tasks";

export type Budget = ApiSchema<"BudgetResponse">;
export type BudgetScope = ApiSchema<"BudgetScope">;

/** US dollars as the API takes them: up to 9 digits, up to 6 decimals. */
const USD = /^\d{1,9}(\.\d{1,6})?$/;

/**
 * A limit from a form field: empty means no limit; `$`, spaces and
 * thousands separators are allowed (`$1,000.50`). Otherwise what's wrong.
 */
export function parseLimit(
  text: string | undefined,
): { limitUsd: string | null } | { error: string } {
  const value = (text ?? "").replace(/[\s$,]/g, "");
  if (!value) return { limitUsd: null };
  if (!USD.test(value)) {
    return {
      error:
        "A limit is an amount in US dollars, like 25 or 12.50 (at most 6 decimals).",
    };
  }
  return { limitUsd: value };
}

/** What a form field starts from: the limit without trailing zeros, or empty for none. */
export function limitField(budget: Pick<Budget, "limitUsd">): string {
  if (budget.limitUsd === null) return "";
  return budget.limitUsd.includes(".")
    ? budget.limitUsd.replace(/\.?0+$/, "")
    : budget.limitUsd;
}

export type BudgetTone = "none" | "ok" | "warning" | "exceeded";

/**
 * A budget as people read it: what was spent, against what, how much of it
 * (a whole percentage, capped at 100 for the bar), and whether it's close
 * (the threshold) or used up.
 */
export function budgetSummary(budget: Budget): {
  spent: string;
  limit: string;
  percent: number | null;
  tone: BudgetTone;
} {
  const spent = formatCost(budget.spentUsd);
  if (budget.limitUsd === null) {
    return { spent, limit: "no limit", percent: null, tone: "none" };
  }
  const limit = Number(budget.limitUsd);
  const used = Number(budget.spentUsd);
  const percent =
    limit === 0 ? 100 : Math.min(100, Math.floor((used / limit) * 100));
  const tone =
    used >= limit
      ? "exceeded"
      : percent >= budget.thresholdPercent
        ? "warning"
        : "ok";
  return { spent, limit: formatCost(budget.limitUsd), percent, tone };
}

const SCOPE: Record<BudgetScope, { name: string; window: string }> = {
  organization: { name: "the organization's budget", window: "this month" },
  project: { name: "the project's budget", window: "this month" },
  agent: { name: "the agent's budget", window: "this month" },
  task_tree: { name: "this task tree's budget", window: "so far" },
};

/** "this month" for monthly budgets, "so far" for a task tree's. */
export const windowLabel = (scope: BudgetScope) => SCOPE[scope].window;

/** Why a paused task waits, and what brings it back. */
export function pausedMessage(scope: BudgetScope): string {
  const resumes =
    scope === "task_tree"
      ? "It resumes once the budget is raised."
      : "It resumes once the budget is raised, or when the next month starts.";
  return `Paused: ${SCOPE[scope].name} ran out. ${resumes}`;
}
