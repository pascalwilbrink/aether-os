"use client";

import { useActionState } from "react";

import { buttonClass, FormError, inputClass } from "@aether-os/design";
import { PROJECT_ROLES } from "@/lib/members";

import {
  grantProjectRoleAction,
  type FormState,
  type ProjectRef,
} from "./actions";

/** Gives an organization member without one a role in the project. */
export function GrantAccessForm({
  project,
  candidates,
}: {
  project: ProjectRef;
  /** `value` is `<subjectType>:<subject>`. */
  candidates: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    grantProjectRoleAction.bind(null, project),
    {},
  );
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Everyone in the organization who could get a role here has one.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-2">
      <FormError error={state.error} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          Who
          <select
            key={state.values?.member}
            name="member"
            required
            defaultValue={state.values?.member}
            className={inputClass}
          >
            {candidates.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Role
          <select
            key={state.values?.role}
            name="role"
            defaultValue={state.values?.role ?? "editor"}
            className={inputClass}
          >
            {PROJECT_ROLES.map(({ role, label, hint }) => (
              <option key={role} value={role} title={hint}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}
