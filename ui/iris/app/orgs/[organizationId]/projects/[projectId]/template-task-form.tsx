"use client";

import { useActionState } from "react";

import { buttonClass, FormError, inputClass } from "@aether-os/design";
import {
  KnowledgePicker,
  type KnowledgeOption,
} from "@/app/components/knowledge-picker";
import type { TaskTemplateVersion } from "@/lib/api";

import {
  createTaskFromTemplateAction,
  type FormState,
  type ProjectRef,
} from "./actions";
import { RepositorySelect } from "./new-task-form";

/** A task from a template version: its inputs, and the service account to run as. */
export function TemplateTaskForm({
  template,
  version,
  serviceAccounts,
  repositories,
  knowledge,
  idempotencyKey,
}: {
  template: ProjectRef & { templateId: string; version: number };
  version: TaskTemplateVersion;
  serviceAccounts: { id: string; name: string }[];
  /** The project's repository links. */
  repositories: { id: string; name: string }[];
  /** The project's accepted knowledge, to pin on top of the template's. */
  knowledge: KnowledgeOption[];
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
          {input.required === false ? (
            <span className="text-zinc-500"> (optional)</span>
          ) : null}
          {input.description ? (
            <span className="block text-xs text-zinc-500">
              {input.description}
            </span>
          ) : null}
          <input
            name={`input:${input.name}`}
            required={input.required !== false}
            defaultValue={state.values?.[`input:${input.name}`]}
            className={inputClass}
          />
        </label>
      ))}
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
      <RepositorySelect
        repositories={repositories}
        value={state.values?.repositoryLinkId}
      />
      <KnowledgePicker
        knowledge={knowledge}
        checked={state.values?.context?.split(",") ?? []}
        hint="Pinned on top of the template's own, at today's version."
      />
      <button
        type="submit"
        disabled={pending || serviceAccounts.length === 0}
        className={buttonClass}
      >
        {pending ? "Creating…" : "Create task"}
      </button>
    </form>
  );
}
