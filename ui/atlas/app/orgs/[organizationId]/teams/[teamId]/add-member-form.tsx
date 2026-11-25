"use client";

import { useActionState } from "react";

import { buttonClass, FormError, inputClass } from "@aether-os/design";

import type { FormState } from "@/lib/forms";

/** Adds one of the organization's people to the team. */
export function AddMemberForm({
  action,
  candidates,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  candidates: { id: string; name: string; email: string }[];
}) {
  const [state, run, pending] = useActionState(action, {});
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Everyone in the organization is in the team (add people on the People
        page).
      </p>
    );
  }
  return (
    <form action={run} className="flex flex-wrap items-end gap-2">
      <label className="block min-w-60 flex-1 text-sm">
        Add someone
        <select name="personId" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Choose a person
          </option>
          {candidates.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name} ({person.email})
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Adding…" : "Add"}
      </button>
      <div className="basis-full">
        <FormError error={state.error} />
      </div>
    </form>
  );
}
