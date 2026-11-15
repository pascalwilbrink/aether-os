"use client";

import { useActionState } from "react";

import { createOrganizationAction, type CreateOrganizationState } from "./actions";

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState<CreateOrganizationState, FormData>(
    createOrganizationAction,
    {},
  );

  return (
    <form action={action} className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="font-medium">Create an organization</h2>
      {state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
      <label className="block text-sm">
        Name
        <input name="name" required maxLength={200} className="mt-1 block w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700" />
      </label>
      <label className="block text-sm">
        Slug
        <input
          name="slug"
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1 font-mono dark:border-zinc-700"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create"}
      </button>
    </form>
  );
}
