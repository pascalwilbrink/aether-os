"use client";

import { useActionState } from "react";

import { buttonClass, FormError, inputClass, secondaryButtonClass } from "@/app/components/form";
import type { AgentVersion } from "@/lib/api";
import { fieldsOf, MODEL_PROVIDERS } from "@/lib/agents";

import {
  archiveAgentAction,
  createAgentAction,
  createVersionAction,
  publishVersionAction,
  type AgentRef,
  type FormState,
} from "./actions";

/** A new agent: a name and what it's for. Its versions come after. */
export function NewAgentForm({ organizationId }: { organizationId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createAgentAction.bind(null, organizationId),
    {},
  );
  return (
    <form action={action} className="max-w-xl space-y-3">
      <FormError error={state.error} />
      <label className="block text-sm">
        Name
        <input name="name" required maxLength={200} defaultValue={state.values?.name} className={inputClass} />
      </label>
      <label className="block text-sm">
        Description
        <textarea
          name="description"
          maxLength={2000}
          rows={3}
          defaultValue={state.values?.description}
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Creating…" : "Create agent"}
      </button>
    </form>
  );
}

/**
 * A new version, starting from `from` (the latest one) when there is one:
 * versions never change, so editing an agent is writing its next version.
 */
export function VersionForm({ agent, from }: { agent: AgentRef; from: AgentVersion | undefined }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createVersionAction.bind(null, agent), {});
  const carried = (from?.tools.length ?? 0) + (from?.skills.length ?? 0);
  // A refused submit starts from what was sent; otherwise from `from`.
  const start = state.values ?? fieldsOf(from);
  return (
    <form action={action} className="space-y-3">
      <FormError error={state.error} />
      {state.notice ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          {state.notice}
        </p>
      ) : null}
      <label className="block text-sm">
        Instructions
        <textarea
          name="instructions"
          required
          rows={8}
          defaultValue={start.instructions}
          className={`${inputClass} font-mono text-sm`}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-sm">
          Provider
          <input name="provider" required list="model-providers" defaultValue={start.provider} className={inputClass} />
          <datalist id="model-providers">
            {MODEL_PROVIDERS.map((provider) => (
              <option key={provider} value={provider} />
            ))}
          </datalist>
        </label>
        <label className="block text-sm sm:col-span-3">
          Model
          <input name="model" required defaultValue={start.model} className={inputClass} />
        </label>
        <label className="block text-sm">
          Temperature
          <input
            name="temperature"
            type="number"
            min={0}
            max={2}
            step={0.1}
            defaultValue={start.temperature}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          Max tokens
          <input
            name="maxTokens"
            type="number"
            min={1}
            step={1}
            defaultValue={start.maxTokens}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          Mode
          {/* Keyed: a form reset doesn't move a select to a new defaultValue. */}
          <select
            key={start.executionMode}
            name="executionMode"
            defaultValue={start.executionMode}
            className={inputClass}
          >
            <option value="standard">Standard</option>
            <option value="coding">Coding</option>
          </select>
        </label>
        <label className="block text-sm">
          Capabilities
          <input
            name="capabilities"
            placeholder="code, chat"
            defaultValue={start.capabilities}
            className={inputClass}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="sandboxRequired" defaultChecked={start.sandboxRequired === "on"} /> Runs in a
        sandbox (a shell of its own; needed for command checks)
      </label>
      <input type="hidden" name="runtimeProvider" value={start.runtimeProvider} />
      <input type="hidden" name="tools" value={start.tools} />
      <input type="hidden" name="skills" value={start.skills} />
      {carried > 0 ? (
        <p className="text-xs text-zinc-500">
          Its {carried} tool and skill settings carry over from version {from?.version}; Iris can&apos;t edit them yet.
        </p>
      ) : null}
      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Save version"}
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="publish" defaultChecked={start.publish === "on"} /> Publish it
        </label>
      </div>
    </form>
  );
}

/** Publishes a draft version. */
export function PublishButton({ version }: { version: AgentRef & { versionId: string } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(publishVersionAction.bind(null, version), {});
  return (
    <form action={action} className="inline">
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {pending ? "Publishing…" : "Publish"}
      </button>
      <FormError error={state.error} />
    </form>
  );
}

/** Archives the agent, after asking. */
export function ArchiveButton({ agent }: { agent: AgentRef }) {
  const [state, action, pending] = useActionState<FormState, FormData>(archiveAgentAction.bind(null, agent), {});
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm("Archive this agent? It can't get new versions or tasks; tasks it already has keep running.")) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {pending ? "Archiving…" : "Archive"}
      </button>
      <FormError error={state.error} />
    </form>
  );
}
