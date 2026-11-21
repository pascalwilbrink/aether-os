"use client";

import { useActionState, useState } from "react";

import { buttonClass, FormError, inputClass } from "@/app/components/form";
import {
  KnowledgePicker,
  type KnowledgeOption,
} from "@/app/components/knowledge-picker";
import {
  CONCURRENCY_POLICIES,
  EVENTS,
  FIELDS,
  PERMISSIONS,
  type AutomationFields,
} from "@/lib/automations";

import type { FormState } from "../actions";

interface Option {
  id: string;
  name: string;
}

export interface AutomationOptions {
  agents: Option[];
  serviceAccounts: Option[];
  templates: Option[];
  /** The project's repository links. */
  repositories: Option[];
  /** The project's accepted knowledge (Seshat), to pin on its tasks. */
  knowledge: KnowledgeOption[];
}

/**
 * An automation's trigger and the task it starts, for a new one or to
 * change one. The task's text can use the event's fields.
 */
export function AutomationForm({
  action,
  defaults,
  options,
  submitLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  defaults: AutomationFields;
  options: AutomationOptions;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? defaults;
  const [kind, setKind] = useState(
    values.kind === "template" ? "template" : "task",
  );
  if (options.serviceAccounts.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        An automation&apos;s tasks run as a service account with a role in this
        project: give one a role under Access, on the project&apos;s page.
      </p>
    );
  }
  const select = (
    name: string,
    choices: { value: string; label: string }[],
    emptyLabel?: string,
  ) => (
    // Keyed: a form reset doesn't move a select to a new defaultValue.
    <select
      key={`${name}:${values[name]}`}
      name={name}
      defaultValue={values[name] ?? ""}
      className={inputClass}
    >
      {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
      {choices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  );
  const checkbox = (name: string, label: React.ReactNode, value = "on") => (
    <label className="flex items-center gap-2 text-sm">
      <input
        key={`${name}:${values[name]}`}
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={values[name] === value}
      />{" "}
      {label}
    </label>
  );
  const options_ = (list: Option[]) =>
    list.map(({ id, name }) => ({ value: id, label: name }));

  return (
    <form action={formAction} className="space-y-6">
      <FormError error={state.error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Name
          <input
            name="name"
            required
            maxLength={200}
            defaultValue={values.name}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          Description <span className="text-zinc-500">(optional)</span>
          <input
            name="description"
            maxLength={2000}
            defaultValue={values.description}
            className={inputClass}
          />
        </label>
      </div>

      <fieldset className="space-y-3">
        <legend className="font-medium">When</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Event
            {select(
              "event",
              EVENTS.map(({ value, label }) => ({ value, label })),
            )}
          </label>
          <label className="block text-sm">
            Repository
            {select(
              "repositoryLinkId",
              options_(options.repositories),
              "Any repository linked to the project",
            )}
          </label>
          <label className="block text-sm">
            Label <span className="text-zinc-500">(optional)</span>
            <input
              name="label"
              maxLength={100}
              defaultValue={values.label}
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-zinc-500">
              For “labelled”, the label added; otherwise one the issue must
              have.
            </span>
          </label>
          <label className="block text-sm">
            Who may fire it (their role on the repository)
            {select(
              "minimumPermission",
              PERMISSIONS.map(({ value, label }) => ({ value, label })),
            )}
            <span className="mt-1 block text-xs text-zinc-500">
              Issues are written by whoever opens them and reach the agent: keep
              this at write unless a label only maintainers can add guards it.
            </span>
          </label>
        </div>
        {checkbox("includePullRequests", "Also pull requests' conversations")}
        {checkbox(
          "includeAetherOs",
          "Also what Aether-os's own bot does (it could fire itself again)",
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-medium">Start a task</legend>
        <div className="flex gap-4 text-sm">
          {(["task", "template"] as const).map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
              />
              {value === "task" ? "Written here" : "From a template"}
            </label>
          ))}
        </div>
        {kind === "task" ? (
          options.agents.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              A task needs an agent with a published version: create one under
              Agents, on the organization&apos;s page.
            </p>
          ) : (
            <>
              <label className="block text-sm">
                Agent
                {select("agentId", options_(options.agents))}
              </label>
              <label className="block text-sm">
                Title
                <input
                  name="title"
                  maxLength={200}
                  defaultValue={values.title}
                  className={inputClass}
                />
              </label>
              <label className="block text-sm">
                Instructions
                <textarea
                  name="instructions"
                  rows={4}
                  defaultValue={values.instructions}
                  className={inputClass}
                />
              </label>
            </>
          )
        ) : options.templates.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No task templates for this project yet.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Template
                {select("templateId", options_(options.templates))}
              </label>
              <label className="block text-sm">
                Version{" "}
                <span className="text-zinc-500">
                  (empty: the latest when it fires)
                </span>
                <input
                  name="templateVersion"
                  inputMode="numeric"
                  defaultValue={values.templateVersion}
                  className={`${inputClass} w-32`}
                />
              </label>
            </div>
            <label className="block text-sm">
              Inputs{" "}
              <span className="text-zinc-500">(one name=value per line)</span>
              <textarea
                name="inputs"
                rows={3}
                defaultValue={values.inputs}
                placeholder="issue={{issue.url}}"
                className={`${inputClass} font-mono`}
              />
            </label>
          </>
        )}
        <p className="text-xs text-zinc-500">
          The text can use {FIELDS.map((field) => `{{${field}}}`).join(", ")}.
        </p>
        <label className="block text-sm">
          Runs as
          {select("serviceAccountId", options_(options.serviceAccounts))}
        </label>
        {checkbox(
          "workInRepository",
          "Works in the issue's repository (its commits come back as a pull request)",
        )}
        {checkbox("review", "Everything it produces needs approval", "all")}
        <KnowledgePicker
          knowledge={options.knowledge}
          checked={(values.context ?? "").split(",")}
          hint="Pinned on every task it starts, at that day's version (e.g. the project's conventions)."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Concurrency key <span className="text-zinc-500">(optional)</span>
            <input
              name="concurrencyKey"
              maxLength={150}
              defaultValue={values.concurrencyKey}
              placeholder="{{repository}}#{{issue.number}}"
              className={`${inputClass} font-mono`}
            />
            <span className="mt-1 block text-xs text-zinc-500">
              Tasks of this automation with the same key don&apos;t run side by
              side; empty for no limit.
            </span>
          </label>
          <label className="block text-sm">
            While one with the same key is unfinished
            {select(
              "concurrencyPolicy",
              CONCURRENCY_POLICIES.map(({ value, label }) => ({
                value,
                label,
              })),
            )}
          </label>
        </div>
      </fieldset>

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
