import { FormError } from "@aether-os/design";

import type { FormState } from "@/lib/forms";

/** A form's outcome: its error, or that it was saved. */
export function FormStatus({ state }: { state: FormState }) {
  if (state.error) return <FormError error={state.error} />;
  return state.saved ? (
    <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
      Saved.
    </p>
  ) : null;
}
