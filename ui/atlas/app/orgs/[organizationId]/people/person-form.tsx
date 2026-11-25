"use client";

import { useActionState } from "react";

import { buttonClass, inputClass } from "@aether-os/design";

import type { Department, Person } from "@/lib/api/polis";
import type { FormState } from "@/lib/forms";

import { DepartmentsField } from "../../../components/departments-field";
import { FormStatus } from "../../../components/form-status";

/** A new person, or a person's details and departments. */
export function PersonForm({
  action,
  departments,
  initial,
  submitLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  departments: Department[];
  initial?: Person;
  submitLabel: string;
}) {
  const [state, run, pending] = useActionState(action, {});
  const value = (name: string, fallback: string | null = "") =>
    state.values?.text[name] ?? fallback ?? "";

  return (
    <form action={run} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
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
        <label className="block text-sm">
          Email address
          <input
            name="email"
            type="email"
            required
            maxLength={320}
            defaultValue={value("email", initial?.email)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          Role
          <input
            name="role"
            maxLength={200}
            placeholder="e.g. Backend engineer"
            defaultValue={value("role", initial?.role)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          Gender
          <input
            name="gender"
            maxLength={100}
            placeholder="Optional"
            defaultValue={value("gender", initial?.gender)}
            className={inputClass}
          />
        </label>
      </div>
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
      <p className="text-xs text-zinc-500">
        The role is a job title, for information: what someone may do in
        Aether-os comes from their membership. Someone is linked to the user
        who signs up with the same email address.
      </p>
      <FormStatus state={state} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
