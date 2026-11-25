"use client";

import { useActionState } from "react";

import {
  buttonClass,
  FormError,
  inputClass,
  secondaryButtonClass,
} from "@aether-os/design";

import { reviewAction, type FormState, type ProjectRef } from "./actions";

/** A draft's decision: approve, request changes (with a comment), or reject. */
export function ReviewForm({
  artifact,
}: {
  artifact: ProjectRef & { taskId: string; artifactId: string };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    reviewAction.bind(null, artifact),
    {},
  );
  return (
    <form
      action={action}
      className="space-y-2 rounded-md bg-amber-50 p-3 dark:bg-amber-950/40"
    >
      <FormError error={state.error} />
      <label className="block text-sm">
        Comment
        <textarea
          name="comment"
          rows={2}
          placeholder="Required when requesting changes"
          defaultValue={state.values?.comment}
          className={inputClass}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending}
          className={buttonClass}
        >
          Approve
        </button>
        <button
          type="submit"
          name="decision"
          value="request-changes"
          disabled={pending}
          className={secondaryButtonClass}
        >
          Request changes
        </button>
        <button
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
          className={secondaryButtonClass}
        >
          Reject
        </button>
      </div>
    </form>
  );
}
