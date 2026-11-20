"use client";

import { useActionState } from "react";

import { FormError, secondaryButtonClass } from "@/app/components/form";

import { taskAction, type FormState, type ProjectRef } from "./actions";

/** Cancel and retry, as the task's state allows. */
export function TaskActions({
  task,
  cancel,
  retry,
}: {
  task: ProjectRef & { taskId: string };
  cancel: boolean;
  retry: boolean;
}) {
  const [cancelState, cancelAction, cancelling] = useActionState<
    FormState,
    FormData
  >(taskAction.bind(null, { ...task, action: "cancel" }), {});
  const [retryState, retryAction, retrying] = useActionState<
    FormState,
    FormData
  >(taskAction.bind(null, { ...task, action: "retry" }), {});
  if (!cancel && !retry) {
    return null;
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {cancel ? (
          <form action={cancelAction}>
            <button
              type="submit"
              disabled={cancelling}
              className={secondaryButtonClass}
            >
              {cancelling ? "Cancelling…" : "Cancel"}
            </button>
          </form>
        ) : null}
        {retry ? (
          <form action={retryAction}>
            <button
              type="submit"
              disabled={retrying}
              className={secondaryButtonClass}
            >
              {retrying ? "Retrying…" : "Retry"}
            </button>
          </form>
        ) : null}
      </div>
      <FormError error={cancelState.error ?? retryState.error} />
    </div>
  );
}
