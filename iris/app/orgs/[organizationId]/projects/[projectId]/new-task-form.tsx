"use client";

import { useActionState } from "react";

import { buttonClass, FormError, inputClass } from "@/app/components/form";
import { formatBytes, INPUT_FILE_LIMITS } from "@/lib/files";
import { MAX_TASK_CONTEXT } from "@/lib/tasks";

import { DeliverablesEditor } from "./deliverables-editor";

import { createTaskAction, type FormState, type ProjectRef } from "./actions";

interface Option {
  id: string;
  name: string;
}

interface KnowledgeOption {
  id: string;
  title: string;
  type: string;
}

/** A task written by hand: what to do, which agent, as which service account. */
export function NewTaskForm({
  project,
  agents,
  serviceAccounts,
  repositories,
  knowledge,
  idempotencyKey,
}: {
  project: ProjectRef;
  agents: Option[];
  serviceAccounts: Option[];
  /** The project's repository links. */
  repositories: Option[];
  /** The project's accepted knowledge, to pin on the task. */
  knowledge: KnowledgeOption[];
  idempotencyKey: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createTaskAction.bind(null, project),
    {},
  );
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
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={state.values?.title}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        Description{" "}
        <span className="text-zinc-500">(what needs to be done, and why)</span>
        <textarea
          name="description"
          required
          rows={4}
          defaultValue={state.values?.description}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        Expected outcome <span className="text-zinc-500">(optional)</span>
        <textarea
          name="expectedOutcome"
          rows={2}
          placeholder="The end state when it's done"
          defaultValue={state.values?.expectedOutcome}
          className={inputClass}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Requirements <span className="text-zinc-500">(optional)</span>
          <textarea
            name="requirements"
            rows={3}
            placeholder={
              "What must be implemented, one per line\nREQ-1: Expose GET /v1/invoices"
            }
            defaultValue={state.values?.requirements}
            className={`${inputClass} font-mono text-xs`}
          />
        </label>
        <label className="block text-sm">
          Constraints <span className="text-zinc-500">(optional)</span>
          <textarea
            name="constraints"
            rows={3}
            placeholder={"Limits on how, one per line\nNo new dependencies"}
            defaultValue={state.values?.constraints}
            className={`${inputClass} font-mono text-xs`}
          />
        </label>
      </div>
      <p className="-mt-1 text-xs text-zinc-500">
        One per line; start a line with its key (<code>REQ-1:</code>) to name
        it, else it&apos;s numbered.
      </p>
      <DeliverablesEditor
        // Keyed: a refused form starts from what was sent.
        key={state.values?.deliverables ?? ""}
        initial={state.values?.deliverables}
      />
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
      <RepositorySelect
        repositories={repositories}
        value={state.values?.repositoryLinkId}
      />
      <KnowledgePicker
        knowledge={knowledge}
        checked={state.values?.context?.split(",") ?? []}
      />
      <label className="block text-sm">
        Files <span className="text-zinc-500">(optional)</span>
        <input
          type="file"
          name="inputFiles"
          multiple
          className={`${inputClass} file:mr-3`}
        />
        <span className="mt-1 block text-xs text-zinc-500">
          What the task starts from: the agent finds them in its sandbox, in
          /workspace/inputs (its version needs a sandbox). At most{" "}
          {INPUT_FILE_LIMITS.count}, {formatBytes(INPUT_FILE_LIMITS.bytes)}{" "}
          each.
        </span>
      </label>
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
          US dollars for this task and its subtasks&apos; model calls; it pauses
          when they reach it.
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="review"
          value="all"
          defaultChecked={state.values?.review === "all"}
        />{" "}
        Everything it produces needs approval
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
      <select
        key={value}
        name="repositoryLinkId"
        defaultValue={value ?? ""}
        className={inputClass}
      >
        <option value="">None</option>
        {repositories.map((repository) => (
          <option key={repository.id} value={repository.id}>
            {repository.name}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs text-zinc-500">
        The agent works in a copy of it; its commits come back as a pull request
        (the agent version needs a sandbox).
      </span>
    </label>
  );
}

/**
 * The project's accepted knowledge to pin on the task (`context`): its text
 * at today's version goes into the agent's prompt, for every run.
 */
function KnowledgePicker({
  knowledge,
  checked,
}: {
  knowledge: KnowledgeOption[];
  checked: string[];
}) {
  if (knowledge.length === 0) {
    return null;
  }
  return (
    <fieldset className="text-sm">
      <legend>
        Knowledge <span className="text-zinc-500">(optional)</span>
      </legend>
      <div className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
        {knowledge.map((item) => (
          <label key={item.id} className="flex items-baseline gap-2">
            <input
              type="checkbox"
              name="context"
              value={item.id}
              defaultChecked={checked.includes(item.id)}
            />
            <span>
              {item.title}{" "}
              <span className="text-xs text-zinc-500">{item.type}</span>
            </span>
          </label>
        ))}
      </div>
      <span className="mt-1 block text-xs text-zinc-500">
        Pinned at today&apos;s version: written items go into the agent&apos;s
        prompt, documents are listed for it to read. At most {MAX_TASK_CONTEXT}.
      </span>
    </fieldset>
  );
}
