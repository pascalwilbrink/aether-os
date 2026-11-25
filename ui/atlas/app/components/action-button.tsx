"use client";

import { useActionState } from "react";

import { FormError, secondaryButtonClass } from "@aether-os/design";

import type { FormState } from "@/lib/forms";

const dangerClass =
  "rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950";

/**
 * One button that runs a Server Function (archive, delete, remove), after
 * `confirm` if given, and shows its error.
 */
export function ActionButton({
  action,
  label,
  pendingLabel,
  confirm,
  danger = false,
}: {
  action: () => Promise<FormState>;
  label: string;
  pendingLabel?: string;
  confirm?: string;
  danger?: boolean;
}) {
  const [state, run, pending] = useActionState<FormState, FormData>(
    () => action(),
    {},
  );
  return (
    <form
      action={run}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className="inline-flex flex-col items-start gap-1"
    >
      <button
        type="submit"
        disabled={pending}
        className={danger ? dangerClass : secondaryButtonClass}
      >
        {pending ? (pendingLabel ?? `${label}…`) : label}
      </button>
      <FormError error={state.error} />
    </form>
  );
}
