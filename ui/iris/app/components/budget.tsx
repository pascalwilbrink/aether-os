"use client";

import { useActionState } from "react";

import { buttonClass, FormError, inputClass } from "@aether-os/design";
import {
  budgetSummary,
  limitField,
  windowLabel,
  type Budget,
} from "@/lib/budgets";

/** What a budget form's Server Function returns. */
export interface BudgetFormState {
  error?: string;
  notice?: string;
  /** What was submitted, shown again after a refused submit. */
  limit?: string;
}

const BAR: Record<string, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  exceeded: "bg-red-600",
};

/** Spent against the limit, with a bar once there is one. */
export function BudgetMeter({ budget }: { budget: Budget }) {
  const summary = budgetSummary(budget);
  return (
    <div className="space-y-1 text-sm">
      <p>
        <span className="font-medium">{summary.spent}</span> spent{" "}
        {windowLabel(budget.scope)}
        {summary.percent === null ? (
          <span className="text-zinc-500"> · no limit</span>
        ) : (
          <>
            {" "}
            of <span className="font-medium">{summary.limit}</span>
            <span className="text-zinc-500"> ({summary.percent}%)</span>
          </>
        )}
      </p>
      {summary.percent === null ? null : (
        <div
          className="h-2 w-full max-w-md overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={summary.percent}
          aria-label="Budget used"
        >
          <div
            className={`h-full ${BAR[summary.tone]}`}
            style={{ width: `${summary.percent}%` }}
          />
        </div>
      )}
      {summary.tone === "exceeded" ? (
        <p className="text-red-700 dark:text-red-300">
          Used up: tasks that count against it pause until it&apos;s raised.
        </p>
      ) : summary.tone === "warning" ? (
        <p className="text-amber-700 dark:text-amber-300">Nearly used up.</p>
      ) : null}
    </div>
  );
}

/** Sets a budget's limit (empty for none) with one bound Server Function. */
export function BudgetForm({
  budget,
  action,
}: {
  budget: Budget;
  action: (state: BudgetFormState, form: FormData) => Promise<BudgetFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-2">
      <FormError error={state.error} />
      {state.notice ? (
        <p
          role="status"
          className="text-sm text-emerald-700 dark:text-emerald-300"
        >
          {state.notice}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          Limit (US dollars{budget.scope === "task_tree" ? "" : " per month"})
          <input
            key={limitField(budget)}
            name="limit"
            inputMode="decimal"
            placeholder="No limit"
            defaultValue={state.limit ?? limitField(budget)}
            className={`${inputClass} w-40`}
          />
        </label>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
