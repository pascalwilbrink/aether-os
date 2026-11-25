"use client";

import { Recovering } from "./components/recovering";
import { PublicShell } from "./components/public-shell";

/** A page outside an organization that couldn't load (e.g. Polis not up yet). */
export default function PageError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <PublicShell>
      <Recovering error={error} retry={retry} />
    </PublicShell>
  );
}
