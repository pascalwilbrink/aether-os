"use client";

import { useActionState } from "react";

import {
  buttonClass,
  FormError,
  inputClass,
  secondaryButtonClass,
} from "@aether-os/design";

import type { FormState } from "@/lib/forms";

type Role = { role: string; label: string; hint?: string };

/** Changes one role (`role`): a select and a button, with Polis's refusal under it. */
export function RoleForm({
  action,
  roles,
  current,
  label,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  roles: Role[];
  current: string;
  /** For screen readers: whose role this is. */
  label: string;
}) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <select
          // A form resets after its action; keyed on the role, it shows the
          // new one once the page has it, not the one it started with.
          key={current}
          name="role"
          aria-label={label}
          defaultValue={current}
          className={`${inputClass} mt-0 w-36`}
        >
          {roles.map(({ role, label: text, hint }) => (
            <option key={role} value={role} title={hint}>
              {text}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className={secondaryButtonClass}>
          {pending ? "Saving…" : "Change"}
        </button>
      </div>
      <FormError error={state.error} />
    </form>
  );
}

/**
 * Gives someone a role: who (a `subject` select, or a fixed one), and the
 * role. For organization access and for a project's.
 */
export function GrantForm({
  action,
  candidates,
  subject,
  roles,
  defaultRole,
  submitLabel,
  empty,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  /** Whom to choose from; absent with a fixed `subject`. */
  candidates?: { value: string; label: string; roles?: string[] }[];
  subject?: string;
  roles: Role[];
  defaultRole: string;
  submitLabel: string;
  /** What to say when there's no one to choose. */
  empty?: string;
}) {
  const [state, run, pending] = useActionState(action, {});
  if (candidates && candidates.length === 0) {
    return <p className="text-sm text-zinc-500">{empty}</p>;
  }
  return (
    <form action={run} className="flex flex-wrap items-end gap-2">
      {subject ? (
        <input type="hidden" name="subject" value={subject} />
      ) : (
        <label className="block min-w-56 flex-1 text-sm">
          Who
          <select name="subject" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Choose someone
            </option>
            {candidates?.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-sm">
        Role
        <select name="role" defaultValue={defaultRole} className={`${inputClass} w-36`}>
          {roles.map(({ role, label, hint }) => (
            <option key={role} value={role} title={hint}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : submitLabel}
      </button>
      <div className="basis-full">
        <FormError error={state.error} />
      </div>
    </form>
  );
}
