"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * What the page shows the person, for the copilot (docs/interaction.md,
 * "Built: the copilot"): pages publish it here with `usePageContext`, and
 * the copilot, which sits beside the page rather than around it, reads it
 * all with `usePageContexts` and sends it as the run's context.
 */

type Entry = { description: string; value: Record<string, unknown> };

let entries: readonly Entry[] = [];
const listeners = new Set<() => void>();

function publish(next: readonly Entry[]) {
  entries = next;
  for (const listener of listeners) listener();
}

/** Publishes one piece of what the page shows, while the page shows it. */
export function usePageContext(description: string, value: Record<string, unknown>) {
  const serialized = JSON.stringify(value);
  useEffect(() => {
    const entry = { description, value: JSON.parse(serialized) as Record<string, unknown> };
    publish([...entries, entry]);
    return () => publish(entries.filter((current) => current !== entry));
  }, [description, serialized]);
}

/** Everything the page publishes now. */
export function usePageContexts(): readonly Entry[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => entries,
    () => entries,
  );
}

/** What a page shows the person, for the copilot (a Server Component can render it). */
export function CopilotPageContext({
  description,
  value,
}: {
  description: string;
  value: Record<string, unknown>;
}) {
  usePageContext(description, value);
  return null;
}
