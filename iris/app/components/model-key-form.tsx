"use client";

import { useActionState } from "react";

import { buttonClass, FormError, inputClass } from "@/app/components/form";

export interface KeyFormState {
  error?: string;
  notice?: string;
}

/**
 * A provider key field (a password field, never prefilled: keys are
 * write-only) with one bound Server Function.
 */
export function ModelKeyForm({
  action,
  label,
  replacing,
}: {
  action: (state: KeyFormState, form: FormData) => Promise<KeyFormState>;
  label: string;
  replacing: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-1">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          {label}
          <input
            name="apiKey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={replacing ? "Paste a new key to replace it" : "Paste the API key"}
            className={`${inputClass} w-80`}
          />
        </label>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : replacing ? "Replace" : "Save"}
        </button>
      </div>
      <FormError error={state.error} />
      {state.notice ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          {state.notice}
        </p>
      ) : null}
    </form>
  );
}
