"use client";

import { useActionState } from "react";

import { buttonClass, FormError, inputClass } from "@/app/components/form";

import type { FormState, ProjectRef } from "../actions";
import { createSessionAction } from "./actions";

/** Starts a session: who to talk to, and an optional title. */
export function NewSessionForm({
  project,
  agents,
  councils,
}: {
  project: ProjectRef;
  agents: { id: string; name: string }[];
  councils: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    createSessionAction.bind(null, project),
    {},
  );
  const values = state.values ?? {};
  if (agents.length === 0 && councils.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        There&apos;s no agent or council with a published version to talk to
        yet. Publish one first.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <FormError error={state.error} />
      <label className="block text-sm">
        Talk to
        <select
          key={values.subject}
          name="subject"
          required
          defaultValue={values.subject ?? ""}
          className={inputClass}
        >
          <option value="" disabled>
            Choose an agent or a council
          </option>
          {agents.length > 0 && (
            <optgroup label="Agents">
              {agents.map((agent) => (
                <option key={agent.id} value={`agent:${agent.id}`}>
                  {agent.name}
                </option>
              ))}
            </optgroup>
          )}
          {councils.length > 0 && (
            <optgroup label="Councils">
              {councils.map((council) => (
                <option key={council.id} value={`council:${council.id}`}>
                  {council.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <label className="block text-sm">
        Title (optional)
        <input
          name="title"
          maxLength={200}
          defaultValue={values.title}
          className={inputClass}
        />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Starting…" : "Start session"}
      </button>
    </form>
  );
}
