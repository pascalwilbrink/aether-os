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
  repositories,
  idempotencyKey,
}: {
  project: ProjectRef;
  agents: Option[];
  serviceAccounts: Option[];
  /** The project's repository links. */
  repositories: Option[];
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createTaskAction.bind(null, project), {});
  if (agents.length === 0 || serviceAccounts.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {agents.length === 0
          ? "A task needs an agent with a published version: create one under Agents, on the organization's page."
          : "A task runs as a service account with a role in this project: give one a role under Access, above."}
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
      <RepositorySelect repositories={repositories} value={state.values?.repositoryLinkId} />
      <label className="block text-sm">
        Budget <span className="text-zinc-500">(optional)</span>
        <input
          name="budgetUsd"
          inputMode="decimal"
          placeholder="No limit"
          defaultValue={state.values?.budgetUsd}
          className={`${inputClass} w-40`}
        />
        <span className="mt-1 block text-xs text-zinc-500">
          US dollars for this task and its subtasks&apos; model calls; it pauses when they reach it.
        </span>
      </label>
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

/** The repository a task works in: one of the project's links, or none. */
export function RepositorySelect({
  repositories,
  value,
}: {
  repositories: { id: string; name: string }[];
  value: string | undefined;
}) {
  if (repositories.length === 0) {
    return null;
  }
  return (
    <label className="block text-sm">
      Repository
      {/* Keyed: a form reset doesn't move a select to a new defaultValue. */}
      <select key={value} name="repositoryLinkId" defaultValue={value ?? ""} className={inputClass}>
        <option value="">None</option>
        {repositories.map((repository) => (
          <option key={repository.id} value={repository.id}>
            {repository.name}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-zinc-500">
        The agent works in a copy of it; its commits come back as a pull request (the agent version needs a sandbox).
      </span>
    </label>
  );
}
