"use client";

import { useActionState } from "react";

import { buttonClass, FormError, inputClass } from "@/app/components/form";

import { createTaskAction, type FormState, type ProjectRef } from "./actions";

interface Option {
  id: string;
  name: string;
}

/** A task written by hand: what to do, which agent, as which service account. */
export function NewTaskForm({
  project,
  agents,
  serviceAccounts,
  idempotencyKey,
}: {
  project: ProjectRef;
  agents: Option[];
  serviceAccounts: Option[];
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTaskAction.bind(null, project), {});
  if (agents.length === 0 || serviceAccounts.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        A task needs an agent with a published version and a service account to run as.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <FormError error={state.error} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <label className="block text-sm">
        Title
        <input name="title" required maxLength={200} defaultValue={state.values?.title} className={inputClass} />
      </label>
      <label className="block text-sm">
        Instructions
        <textarea
          name="instructions"
          required
          rows={4}
          defaultValue={state.values?.instructions}
          className={inputClass}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Agent
          <select
            key={state.values?.agentId}
            name="agentId"
            required
            defaultValue={state.values?.agentId}
            className={inputClass}
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Runs as
          <select
            key={state.values?.serviceAccountId}
            name="serviceAccountId"
            required
            defaultValue={state.values?.serviceAccountId}
            className={inputClass}
          >
            {serviceAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="review" value="all" defaultChecked={state.values?.review === "all"} /> Everything
        it produces needs approval
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Creating…" : "Create task"}
      </button>
    </form>
  );
}
