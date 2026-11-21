"use client";

import { useActionState } from "react";

import { CriteriaEditor } from "@/app/components/criteria-editor";
import { DeliverablesEditor } from "@/app/components/deliverables-editor";
import { buttonClass, FormError, inputClass } from "@/app/components/form";
import {
  KnowledgePicker,
  type KnowledgeOption,
} from "@/app/components/knowledge-picker";
import type { TemplateFields } from "@/lib/templates";

export interface TemplateFormState {
  error?: string;
  notice?: string;
  values?: TemplateFields;
}

interface Option {
  id: string;
  name: string;
}

/**
 * A task template's version (docs/tasks.md, Task templates): for a new
 * template with its name, or the next version of one, starting from its
 * latest. Its text can use `{{input}}` placeholders. A project's template
 * can extend an organization-wide one (inheriting its title, what to do and
 * agent, and adding to the rest) and pin the project's knowledge.
 */
export function TemplateForm({
  action,
  defaults = {},
  creating,
  agents,
  organizationTemplates,
  knowledge = [],
  submitLabel,
}: {
  action: (
    state: TemplateFormState,
    form: FormData,
  ) => Promise<TemplateFormState>;
  defaults?: TemplateFields;
  /** A new template: its name and description too. */
  creating: boolean;
  agents: Option[];
  /** For a project's template: the organization's to extend (with their latest version). */
  organizationTemplates?: (Option & { latestVersion: number })[];
  /** For a project's template: its accepted knowledge, to pin on every task. */
  knowledge?: KnowledgeOption[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? defaults;
  const text = (name: string) => values[name] ?? "";
  return (
    <form action={formAction} className="space-y-3">
      <FormError error={state.error} />
      {state.notice ? (
        <p
          role="status"
          className="text-sm text-emerald-700 dark:text-emerald-300"
        >
          {state.notice}
        </p>
      ) : null}
      {creating ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Name
            <input
              name="name"
              required
              maxLength={200}
              placeholder="Fix a bug"
              defaultValue={text("name")}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            About it <span className="text-zinc-500">(optional)</span>
            <input
              name="description"
              maxLength={2000}
              placeholder="From a GitHub issue"
              defaultValue={text("description")}
              className={inputClass}
            />
          </label>
        </div>
      ) : null}
      {organizationTemplates && organizationTemplates.length > 0 ? (
        <label className="block text-sm">
          Extends <span className="text-zinc-500">(optional)</span>
          <select
            key={text("extends")}
            name="extends"
            defaultValue={
              text("extendsTemplateId")
                ? `${text("extendsTemplateId")}@${text("extendsVersion")}`
                : ""
            }
            className={inputClass}
          >
            <option value="">Nothing: a template of its own</option>
            {organizationTemplates.flatMap((template) =>
              Array.from({ length: template.latestVersion }, (_, i) => {
                const version = template.latestVersion - i;
                return (
                  <option
                    key={`${template.id}@${version}`}
                    value={`${template.id}@${version}`}
                  >
                    {template.name}, version {version}
                    {i === 0 ? " (latest)" : ""}
                  </option>
                );
              }),
            )}
          </select>
          <span className="mt-1 block text-xs text-zinc-500">
            An organization template it builds on: it inherits the title, what
            to do and the agent unless given here, and adds to the rest.
          </span>
        </label>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Task title
          <input
            name="title"
            maxLength={200}
            placeholder="Fix {{issue}}"
            defaultValue={text("title")}
            className={`${inputClass} font-mono`}
          />
        </label>
        <label className="block text-sm">
          Agent
          <select
            key={text("agentId")}
            name="agentId"
            defaultValue={text("agentId")}
            className={inputClass}
          >
            <option value="">
              {organizationTemplates ? "The one it extends, or…" : "Choose…"}
            </option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        What to do{" "}
        <span className="text-zinc-500">
          (the task&apos;s description: what and why)
        </span>
        <textarea
          name="instructions"
          rows={4}
          placeholder="Fix the bug described in {{issue}}."
          defaultValue={text("instructions")}
          className={inputClass}
        />
      </label>
      <label className="block text-sm">
        Expected outcome <span className="text-zinc-500">(optional)</span>
        <textarea
          name="expectedOutcome"
          rows={2}
          defaultValue={text("expectedOutcome")}
          className={inputClass}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Requirements <span className="text-zinc-500">(optional)</span>
          <textarea
            name="requirements"
            rows={3}
            placeholder={"One per line\nREQ-1: Fix {{issue}}"}
            defaultValue={text("requirements")}
            className={`${inputClass} font-mono text-xs`}
          />
        </label>
        <label className="block text-sm">
          Constraints <span className="text-zinc-500">(optional)</span>
          <textarea
            name="constraints"
            rows={3}
            placeholder={"One per line\nNo new dependencies"}
            defaultValue={text("constraints")}
            className={`${inputClass} font-mono text-xs`}
          />
        </label>
      </div>
      <label className="block text-sm">
        Inputs <span className="text-zinc-500">(optional)</span>
        <textarea
          name="inputs"
          rows={2}
          placeholder={"issue: The issue to fix\nnotes?: Anything else"}
          defaultValue={text("inputs")}
          className={`${inputClass} font-mono text-xs`}
        />
        <span className="mt-1 block text-xs text-zinc-500">
          One per line, <code>name: what it is</code> (a <code>?</code> after
          the name for an optional one); the text above uses them as{" "}
          <code>{"{{name}}"}</code>, filled in when a task starts.
        </span>
      </label>
      <DeliverablesEditor
        key={`deliverables-${text("deliverables")}`}
        initial={text("deliverables")}
      />
      <CriteriaEditor
        key={`criteria-${text("criteria")}`}
        initial={text("criteria")}
      />
      <KnowledgePicker
        knowledge={knowledge}
        checked={text("context").split(",")}
        hint="Pinned on every task from it, at the version of the day the task starts."
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="review"
          value="all"
          defaultChecked={text("review") === "all"}
        />{" "}
        Everything its tasks produce needs approval
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
