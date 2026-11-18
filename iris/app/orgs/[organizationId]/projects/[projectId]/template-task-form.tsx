"use client";

import { useActionState } from "react";

import { buttonClass, FormError, inputClass } from "@/app/components/form";
import type { TaskTemplateVersion } from "@/lib/api";

import { createTaskFromTemplateAction, type FormState, type ProjectRef } from "./actions";

/** A task from a template version: its inputs, and the service account to run as. */
export function TemplateTaskForm({
  template,
  version,
  serviceAccounts,
  idempotencyKey,
}: {
  template: ProjectRef & { templateId: string; version: number };
  version: TaskTemplateVersion;
  serviceAccounts: { id: string; name: string }[];
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createTaskFromTemplateAction.bind(null, template),
    {},
  );
  return (
    <form action={action} className="space-y-3">
      <FormError error={state.error} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {version.effective.inputs.map((input) => (
        <label key={input.name} className="block text-sm">
          {input.name}
          {input.required === false ? <span className="text-zinc-500"> (optional)</span> : null}
          {input.description ? <span className="block text-xs text-zinc-500">{input.description}</span> : null}
          <input name={`input:${input.name}`} required={input.required !== false} className={inputClass} />
        </label>
      ))}
      <label className="block text-sm">
        Runs as
        <select name="serviceAccountId" required className={inputClass}>
          {serviceAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending || serviceAccounts.length === 0} className={buttonClass}>
        {pending ? "Creating…" : "Create task"}
      </button>
    </form>
  );
}
