"use client";

import Link from "next/link";
import { useActionState } from "react";

import { buttonClass, FormError, inputClass } from "@/app/components/form";

import { linkRepositoryAction, type FormState, type ProjectRef } from "./actions";

/** Links one of the organization's repositories (connected through GitHub) to the project. */
export function LinkRepositoryForm({
  project,
  repositories,
  connectHref,
  unavailable,
}: {
  project: ProjectRef;
  /** The organization's available repositories this project hasn't linked. */
  repositories: { id: string; name: string }[];
  connectHref: string;
  unavailable: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(linkRepositoryAction.bind(null, project), {});
  if (unavailable) {
    return null;
  }
  if (repositories.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        No other repositories to link.{" "}
        <Link href={connectHref} className="underline">
          Connect GitHub
        </Link>{" "}
        or add repositories to its installation to link more.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-2">
      <FormError error={state.error} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          Repository
          {/* Keyed: a form reset doesn't move a select to a new defaultValue. */}
          <select
            key={state.values?.repositoryId}
            name="repositoryId"
            required
            defaultValue={state.values?.repositoryId}
            className={inputClass}
          >
            {repositories.map((repository) => (
              <option key={repository.id} value={repository.id}>
                {repository.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Linking…" : "Link"}
        </button>
      </div>
    </form>
  );
}
