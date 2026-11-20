"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  ACTIVITY_POLL_MS,
  eventKind,
  eventTime,
  hasDetails,
  isActive,
  mergeEvents,
} from "@/lib/activity";
import type { ExecutionEventPage } from "@/lib/api";

const LEVEL_CLASS = {
  info: "text-zinc-800 dark:text-zinc-200",
  warn: "text-amber-700 dark:text-amber-300",
  error: "text-red-700 dark:text-red-300",
} as const;

/**
 * An execution's activity (docs/tasks.md, Activity): the runner's steps,
 * model calls and tool calls, oldest first. While the execution runs it
 * asks Iris's route for what's new every couple of seconds; when it ends,
 * the page is refreshed (its status, artifacts and executions).
 */
export function ActivityTimeline({
  url,
  initial,
}: {
  url: string;
  initial: ExecutionEventPage;
}) {
  const router = useRouter();
  const [events, setEvents] = useState(initial.items);
  const [status, setStatus] = useState(initial.executionStatus);
  const [stale, setStale] = useState(false);
  const after = useRef(initial.nextAfter);
  const following = isActive(status);

  useEffect(() => {
    if (!following) {
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(`${url}?after=${after.current}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(String(response.status));
        }
        const page = (await response.json()) as ExecutionEventPage;
        if (stopped) return;
        after.current = page.nextAfter;
        setEvents((seen) => mergeEvents(seen, page.items));
        setStale(false);
        if (!isActive(page.executionStatus)) {
          setStatus(page.executionStatus);
          router.refresh();
          return;
        }
      } catch {
        if (!stopped) setStale(true);
      }
      if (!stopped) timer = setTimeout(poll, ACTIVITY_POLL_MS);
    };
    timer = setTimeout(poll, ACTIVITY_POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [following, url, router]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">
        {following ? (
          <>
            <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Live: updates every few seconds
            {stale ? " (the last update failed; trying again)" : ""}.
          </>
        ) : (
          `This execution is ${status}.`
        )}
      </p>
      {events.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Nothing yet.</p>
      ) : (
        <ol className="max-h-[32rem] space-y-1 overflow-auto rounded-md border border-zinc-200 p-2 font-mono text-xs dark:border-zinc-800">
          {events.map((event) => (
            <li key={event.sequence}>
              {hasDetails(event) ? (
                <details>
                  <summary
                    className={`cursor-pointer ${LEVEL_CLASS[event.level]}`}
                  >
                    <EventLine event={event} />
                  </summary>
                  <div className="mt-1 space-y-1 pl-20">
                    {event.text ? (
                      <Block label="Said" value={event.text} />
                    ) : null}
                    {event.input ? (
                      <Block label="Input" value={event.input} />
                    ) : null}
                    {event.output ? (
                      <Block label="Output" value={event.output} />
                    ) : null}
                  </div>
                </details>
              ) : (
                <div className={`pl-3 ${LEVEL_CLASS[event.level]}`}>
                  <EventLine event={event} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function EventLine({ event }: { event: ExecutionEventPage["items"][number] }) {
  return (
    <>
      <span className="text-zinc-500">{eventTime(event.createdAt)}</span>{" "}
      <span className="inline-block w-14 text-zinc-500">
        {eventKind(event)}
      </span>{" "}
      {event.message}
    </>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-zinc-500">{label}</span>
      <pre className="mt-0.5 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-zinc-100 p-2 dark:bg-zinc-900">
        {value}
      </pre>
    </div>
  );
}
