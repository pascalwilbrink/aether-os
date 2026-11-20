"use client";

import { useActionState } from "react";

import { buttonClass, FormError, inputClass } from "@/app/components/form";
import { ORGANIZATION_ROLES } from "@/lib/members";

import { createServiceAccountAction, type FormState } from "./actions";

/** A new service account and its organization role: member or viewer (it never needs to manage the organization). */
export function NewServiceAccountForm({
  organizationId,
}: {
  organizationId: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createServiceAccountAction.bind(null, organizationId),
    {},
  );
  const roles = ORGANIZATION_ROLES.filter(
    ({ role }) => role === "member" || role === "viewer",
  );
  return (
    <form action={action} className="max-w-xl space-y-3">
      <FormError error={state.error} />
      {state.notice ? (
        <p
          role="status"
          className="text-sm text-emerald-700 dark:text-emerald-300"
        >
          {state.notice}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm sm:col-span-2">
          Name
          <input
            name="name"
            required
            maxLength={200}
            placeholder="ci-bot"
            defaultValue={state.values?.name}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          Role
          <select
            key={state.values?.role}
            name="role"
            defaultValue={state.values?.role ?? "member"}
            className={inputClass}
          >
            {roles.map(({ role, label }) => (
              <option key={role} value={role}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        Description
        <input
          name="description"
          maxLength={2000}
          placeholder="Runs our tasks"
          defaultValue={state.values?.description}
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Creating…" : "Create service account"}
      </button>
    </form>
  );
}
