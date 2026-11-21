"use client";

import "./globals.css";

import { Recovering } from "./components/recovering";

/** The root layout itself failed: a document of its own (Next's `global-error`). */
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 p-8 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        <title>Aether-os</title>
        <Recovering error={error} retry={retry} />
      </body>
    </html>
  );
}
