"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  downServices,
  POLL_MS,
  shouldGiveUp,
  storedTries,
  TRIES_KEY,
  type HealthSnapshot,
} from "@/lib/recovery";

/**
 * When each page was tried again with every service up, in this tab: in
 * `sessionStorage`, since the component remounts with every failed try and
 * `/unavailable` reloads the page; in memory when storage is blocked.
 */
const inMemory: Record<string, number[]> = {};

function readTries(now: number): Record<string, number[]> {
  try {
    return storedTries(sessionStorage.getItem(TRIES_KEY), now);
  } catch {
    return storedTries(JSON.stringify(inMemory), now);
  }
}

function writeTries(tries: Record<string, number[]>): void {
  try {
    sessionStorage.setItem(TRIES_KEY, JSON.stringify(tries));
  } catch {
    for (const page of Object.keys(inMemory)) delete inMemory[page];
    Object.assign(inMemory, tries);
  }
}

type State =
  | { kind: "checking" }
  | { kind: "waiting"; down: string[] }
  | { kind: "failed" };

/**
 * What a page shows when it couldn't load (the `error.tsx` boundaries and
 * `/unavailable`). Usually a service hasn't started yet: it reads Iris's
 * `/health`, names the services that don't answer, and tries the page again
 * by itself as soon as they all do. A page that keeps failing with
 * everything up is a real error: it says so and waits for a click.
 *
 * `retry` re-renders the boundary's page; without it (`/unavailable`, which
 * stands in for the page the browser asked for) the page is reloaded.
 */
export function Recovering({
  error,
  retry,
}: {
  error?: unknown;
  retry?: () => void;
}) {
  const pathname = usePathname();
  const [state, setState] = useState<State>({ kind: "checking" });

  const tryAgain = useCallback(() => {
    if (retry) {
      retry();
    } else {
      window.location.reload();
    }
  }, [retry]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      let down: string[];
      try {
        const response = await fetch("/health", { cache: "no-store" });
        down = downServices((await response.json()) as HealthSnapshot);
      } catch {
        down = ["Iris"];
      }
      if (stopped) {
        return;
      }
      if (down.length > 0) {
        setState({ kind: "waiting", down });
        timer = setTimeout(() => void check(), POLL_MS);
        return;
      }
      const now = Date.now();
      const all = readTries(now);
      const tries = all[pathname] ?? [];
      if (shouldGiveUp(tries, now)) {
        setState({ kind: "failed" });
        return;
      }
      writeTries({ ...all, [pathname]: [...tries, now] });
      tryAgain();
    };

    void check();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pathname, tryAgain]);

  const digest =
    error instanceof Error && "digest" in error
      ? String((error as { digest?: unknown }).digest ?? "")
      : "";
  // Server errors carry their message only in development.
  const detail =
    process.env.NODE_ENV !== "production" && error instanceof Error
      ? error.message
      : null;

  return (
    <section role="alert" aria-live="polite" className="max-w-xl space-y-4">
      {state.kind === "failed" ? (
        <>
          <h1 className="text-xl font-semibold">
            This page couldn&apos;t load
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Every service answers, but the page still failed. Try again, or look
            at the services&apos; logs.
          </p>
        </>
      ) : (
        <>
          <h1 className="flex items-center gap-3 text-xl font-semibold">
            <span
              aria-hidden
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"
            />
            Waiting for Aether-os
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            {state.kind === "waiting" ? (
              <>
                Not answering yet:{" "}
                <strong className="text-zinc-900 dark:text-zinc-100">
                  {state.down.join(", ")}
                </strong>
                . Services may still be starting; this page loads by itself once
                they&apos;re up.
              </>
            ) : (
              "Checking which services are up…"
            )}
          </p>
        </>
      )}
      {detail ? (
        <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          {detail}
        </pre>
      ) : null}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => {
            writeTries(
              Object.fromEntries(
                Object.entries(readTries(Date.now())).filter(([page]) => page !== pathname),
              ),
            );
            tryAgain();
          }}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Try again now
        </button>
        {digest ? (
          <span className="text-xs text-zinc-500">Reference {digest}</span>
        ) : null}
      </div>
    </section>
  );
}
