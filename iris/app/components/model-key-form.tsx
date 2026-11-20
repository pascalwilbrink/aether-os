"use client";

import { useActionState } from "react";

import { buttonClass, FormError, inputClass } from "@/app/components/form";

export interface KeyFormState {
  error?: string;
  notice?: string;
}

/**
 * A provider key field (a password field, never prefilled: keys are
 * write-only) with one bound Server Function. With `baseUrl` (a server the
 * organization runs, Ollama), also its URL, prefilled, and the key is
 * optional.
 */
export function ModelKeyForm({
  action,
  label,
  replacing,
  baseUrl,
}: {
  action: (state: KeyFormState, form: FormData) => Promise<KeyFormState>;
  label: string;
  replacing: boolean;
  /** Set (even to "") to ask for a server's URL. */
  baseUrl?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-1">
      <div className="flex flex-wrap items-end gap-2">
        {baseUrl !== undefined ? (
          <label className="block text-sm">
            Server URL
            <input
              name="baseUrl"
              type="url"
              required
              defaultValue={baseUrl}
              placeholder="https://ollama.example.com"
              className={`${inputClass} w-80 font-mono`}
            />
          </label>
        ) : null}
        <label className="block text-sm">
          {label}
          <input
            name="apiKey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={
              baseUrl !== undefined
                ? "Only if the server wants one"
                : replacing
                  ? "Paste a new key to replace it"
                  : "Paste the API key"
            }
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
