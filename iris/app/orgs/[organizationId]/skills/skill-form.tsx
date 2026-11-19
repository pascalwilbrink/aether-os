"use client";

import { useActionState } from "react";

import { buttonClass, FormError, inputClass } from "@/app/components/form";
import { skillTemplate } from "@/lib/skills";

import type { SkillFormState } from "./actions";

type Action = (state: SkillFormState, form: FormData) => Promise<SkillFormState>;

/**
 * A skill's SKILL.md: for a new skill with its name, for a new version of
 * one starting from its latest.
 */
export function SkillForm({ action, skillMd }: { action: Action; skillMd?: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const creating = skillMd === undefined;
  const start = state.values ?? { name: "", skillMd: skillMd ?? skillTemplate("") };
  return (
    <form action={formAction} className="space-y-3">
      <FormError error={state.error} />
      {state.notice ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          {state.notice}
        </p>
      ) : null}
      {creating ? (
        <label className="block max-w-sm text-sm">
          Name <span className="text-zinc-500">(as in SKILL.md)</span>
          <input
            name="name"
            required
            maxLength={64}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="code-review"
            defaultValue={start.name}
            className={`${inputClass} font-mono`}
          />
        </label>
      ) : null}
      <label className="block text-sm">
        SKILL.md <span className="text-zinc-500">(front matter with its name and description, then the instructions)</span>
        <textarea
          name="skillMd"
          required
          rows={16}
          defaultValue={start.skillMd}
          spellCheck={false}
          className={`${inputClass} font-mono text-sm`}
        />
      </label>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Saving…" : creating ? "Create skill" : "Save as a new version"}
      </button>
    </form>
  );
}
