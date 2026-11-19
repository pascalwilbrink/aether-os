"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { storeValue, useStoredValue } from "@/app/components/stored-value";
import { cardPosition, TOUR_KEY, TOUR_STEPS, tourOpen, type Rect } from "@/lib/tour";

const CARD = { width: 340, height: 260 };

/** Opens the tour again (the person's menu). */
export function startTour() {
  storeValue(TOUR_KEY, "open");
}

/**
 * The tour of Iris: on a first visit (and when asked again), one card per
 * step of `lib/tour.ts`, beside the sidebar element it's about (a spotlight
 * around it), or centred. Next / Back (or the arrow keys), Skip or Escape
 * ends it, remembered in this browser.
 */
export function Tour({ base }: { base: string }) {
  // Seen as finished until hydrated, so the server never renders it.
  const open = tourOpen(useStoredValue(TOUR_KEY, "done"));
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const card = useRef<HTMLDivElement>(null);
  const step = TOUR_STEPS[index];
  const last = index === TOUR_STEPS.length - 1;

  const finish = useCallback(() => {
    storeValue(TOUR_KEY, "done");
    setIndex(0);
  }, []);

  // Where the step's element is, now and when the window changes.
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const element = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
      const box = element?.getBoundingClientRect();
      setTarget(
        box
          ? { top: box.top, left: box.left, right: box.right, bottom: box.bottom, width: box.width, height: box.height }
          : null,
      );
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step.target]);

  useEffect(() => {
    if (!open) return;
    card.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
      if (event.key === "ArrowRight") setIndex((i) => Math.min(i + 1, TOUR_STEPS.length - 1));
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, index, finish]);

  if (!open || viewport.width === 0) return null;
  const position = cardPosition(target, viewport, CARD);

  return (
    <div className="fixed inset-0 z-[60]" role="presentation">
      {position === "center" || !target ? (
        <div className="absolute inset-0 bg-black/50" onClick={finish} />
      ) : (
        // A spotlight: everything dimmed but the element the step is about.
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-indigo-500 transition-all duration-200"
          style={{
            top: target.top - 4,
            left: target.left - 4,
            width: target.width + 8,
            height: target.height + 8,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.5)",
          }}
        />
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        tabIndex={-1}
        className={`absolute rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 shadow-xl outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 ${
          position === "center" ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" : ""
        }`}
        style={{
          width: `min(${CARD.width}px, calc(100vw - 2rem))`,
          ...(position === "center" ? {} : { top: position.top, left: position.left }),
        }}
      >
        <p className="text-xs font-medium tracking-wide text-indigo-600 dark:text-indigo-400">
          {index + 1} of {TOUR_STEPS.length}
        </p>
        <h2 id="tour-title" className="mt-1 text-lg font-semibold">
          {step.title}
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{step.body}</p>
        {step.todo ? (
          <ol className="mt-3 list-inside list-decimal space-y-1 text-sm">
            {step.todo.map((item) => (
              <li key={item.path}>
                <Link href={`${base}${item.path}`} onClick={finish} className="underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ol>
        ) : null}
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={finish}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {last ? "Close" : "Skip the tour"}
          </button>
          <div className="flex gap-2">
            {index > 0 ? (
              <button
                type="button"
                onClick={() => setIndex(index - 1)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => (last ? finish() : setIndex(index + 1))}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
            >
              {last ? "Done" : index === 0 ? "Show me around" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
