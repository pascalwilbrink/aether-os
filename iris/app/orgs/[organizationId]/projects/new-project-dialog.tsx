"use client";

import { useActionState, useRef, useState } from "react";

import {
  buttonClass,
  FormError,
  inputClass,
  secondaryButtonClass,
} from "@/app/components/form";
import { slugify } from "@/lib/projects";

import type { NewProjectState } from "./actions";

type Action = (
  state: NewProjectState,
  form: FormData,
) => Promise<NewProjectState>;

/**
 * The "New project" button and its dialog (a native `<dialog>`: focus is
 * kept inside, Escape closes it). The slug follows the name until it's
 * edited. A refused form stays open with what was typed; a created project
 * opens (the action redirects).
 */
export function NewProjectDialog({ action }: { action: Action }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(action, {});
  const [name, setName] = useState("");
  const [slug, setSlug] = useState<string | null>(null);

  const open = () => {
    dialog.current?.showModal();
  };
  const close = () => {
    dialog.current?.close();
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={`${buttonClass} shrink-0`}
      >
        New project
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="new-project-title"
        onClick={(event) => {
          // A click on the backdrop (the dialog itself, outside its panel) closes it.
          if (event.target === event.currentTarget) close();
        }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-black/50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <form
          // Keyed on the refused values, so the fields start from them after React resets the form.
          key={JSON.stringify(state.values ?? null)}
          action={formAction}
          className="space-y-4 p-6"
        >
          <div>
            <h2 id="new-project-title" className="text-lg font-semibold">
              New project
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              A project holds tasks, automations and repositories, with its own
              budget and access.
            </p>
          </div>
          <FormError error={state.error} />
          <label className="block text-sm">
            Name
            <input
              name="name"
              required
              maxLength={200}
              autoFocus
              defaultValue={state.values?.name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            Slug
            <input
              name="slug"
              required
              minLength={3}
              maxLength={63}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={slug ?? state.values?.slug ?? slugify(name)}
              onChange={(event) => setSlug(event.target.value)}
              className={`${inputClass} font-mono`}
            />
            <span className="mt-1 block text-xs text-zinc-500">
              Lowercase letters, digits and dashes; unique in the organization.
            </span>
          </label>
          <label className="block text-sm">
            Description <span className="text-zinc-500">(optional)</span>
            <textarea
              name="description"
              rows={3}
              maxLength={2000}
              defaultValue={state.values?.description}
              className={inputClass}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className={secondaryButtonClass}
            >
              Cancel
            </button>
            <button type="submit" disabled={pending} className={buttonClass}>
              {pending ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
