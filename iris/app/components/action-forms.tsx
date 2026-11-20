"use client";

import { useActionState } from "react";

import { buttonClass, FormError, secondaryButtonClass } from "./form";

/** What these forms' Server Functions return. */
export interface ActionState {
  error?: string;
}

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

/** One button for one Server Function (bound to what it acts on), optionally after a confirmation. */
export function ActionButton({
  action,
  label,
  pendingLabel,
  confirmText,
  primary = false,
}: {
  action: Action;
  label: string;
  pendingLabel: string;
  confirmText?: string;
  primary?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmText && !confirm(confirmText)) event.preventDefault();
      }}
      className="inline-block"
    >
      <button
        type="submit"
        disabled={pending}
        className={primary ? buttonClass : secondaryButtonClass}
      >
        {pending ? pendingLabel : label}
      </button>
      <FormError error={state.error} />
    </form>
  );
}

/** A role picker with a Save button; submits `role`. */
export function RoleForm({
  action,
  roles,
  current,
  label = "Save",
}: {
  action: Action;
  roles: { role: string; label: string; hint: string }[];
  current?: string;
  label?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <select
        key={current}
        name="role"
        defaultValue={current ?? roles[0]?.role}
        aria-label="Role"
        className="rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
      >
        {roles.map(({ role, label: roleLabel, hint }) => (
          <option key={role} value={role} title={hint}>
            {roleLabel}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {pending ? "Saving…" : label}
      </button>
      <FormError error={state.error} />
    </form>
  );
}
