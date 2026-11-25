"use client";

import { useActionState } from "react";

import { buttonClass, inputClass } from "@aether-os/design";

import type { Department } from "@/lib/api/polis";
import type { FormState } from "@/lib/forms";

import { DepartmentsField } from "../../../components/departments-field";
import { FormStatus } from "../../../components/form-status";

/** A new team (with its slug), or a team's name, description and departments. */
export function TeamForm({
  action,
  departments,
  initial,
  submitLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  departments: Department[];
  /** Absent for a new team, which also takes a slug. */
  initial?: { name: string; description: string; departmentIds: string[] };
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
      <DepartmentsField
        // Re-checked from what was submitted after a refusal.
        key={state.values ? JSON.stringify(state.values.departmentIds) : "initial"}
        departments={departments}
        checked={state.values?.departmentIds ?? initial?.departmentIds ?? []}
      />
      <FormStatus state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
