"use client";

import { useActionState } from "react";

import { buttonClass, inputClass } from "@aether-os/design";

import type { FormState } from "@/lib/forms";

import { FormStatus } from "../../../components/form-status";

/** A new department (with its slug), or a department's name and description. */
export function DepartmentForm({
  action,
  initial,
  submitLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  /** Absent for a new department, which also takes a slug. */
  initial?: { name: string; description: string };
  submitLabel: string;
}) {
  const [state, run, pending] = useActionState(action, {});
  const value = (name: string, fallback = "") =>
    state.values?.text[name] ?? fallback;

  return (
    <form action={run} className="space-y-3">
      <label className="block text-sm">
        Name
        <input
          name="name"
          required
          maxLength={200}
          defaultValue={value("name", initial?.name)}
          className={inputClass}
        />
      </label>
      {initial ? null : (
        <label className="block text-sm">
          Slug
          <input
            name="slug"
            required
            minLength={3}
            maxLength={63}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            defaultValue={value("slug")}
            className={`${inputClass} font-mono`}
          />
          <span className="text-xs text-zinc-500">
            Lowercase letters, digits and single dashes; can&apos;t change later.
          </span>
        </label>
      )}
      <label className="block text-sm">
        Description
        <textarea
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={value("description", initial?.description)}
          className={inputClass}
        />
      </label>
      <FormStatus state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
