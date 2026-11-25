"use client";

import { buttonClass } from "@aether-os/design";

/** A page that failed (Polis down, say): what happened, and trying again. */
export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-16">
      <h1 className="text-xl font-semibold">This page couldn&apos;t load</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        {error.digest
          ? "Something went wrong on the server, or a service can't be reached right now."
          : error.message}
      </p>
      <button type="button" onClick={reset} className={buttonClass}>
        Try again
      </button>
    </div>
  );
}
