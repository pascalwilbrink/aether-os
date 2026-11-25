"use client";

import { useState } from "react";

import { inputClass } from "@aether-os/design";
import {
  BRIEF_LIMITS,
  DELIVERABLE_KINDS,
  type DeliverableKind,
} from "@/lib/task-brief";

interface Row {
  key: string;
  kind: DeliverableKind;
  description: string;
  path: string;
  primary: boolean;
}

const emptyRow = (): Row => ({
  key: "",
  kind: "text",
  description: "",
  path: "",
  primary: false,
});

/**
 * What a new task hands over: a row per deliverable (key, kind, what it is,
 * a file's name, whether it's the main outcome), sent as JSON in the
 * `deliverables` field; the Server Function checks them (`lib/task-brief.ts`).
 */
export function DeliverablesEditor({ initial }: { initial?: string }) {
  const [rows, setRows] = useState<Row[]>(() => rowsOf(initial));
  const update = (index: number, change: Partial<Row>) =>
    setRows((current) =>
      current.map((row, i) =>
        i === index
          ? { ...row, ...change }
          : change.primary
            ? { ...row, primary: false }
            : row,
      ),
    );
  return (
    <fieldset className="text-sm">
      <legend>
        Deliverables <span className="text-zinc-500">(optional)</span>
      </legend>
      <input type="hidden" name="deliverables" value={JSON.stringify(rows)} />
      <p className="text-xs text-zinc-500">
        What the task hands over. Each is checked: the agent submits it under
        its key, and a pull request comes from its commits (the task needs a
        repository).
      </p>
      <ul className="mt-2 space-y-2">
        {rows.map((row, index) => (
          <li
            key={index}
            className="grid gap-2 rounded-md border border-zinc-200 p-2 sm:grid-cols-[8rem_9rem_1fr] dark:border-zinc-800"
          >
            <input
              aria-label="Key"
              placeholder="report"
              value={row.key}
              onChange={(event) => update(index, { key: event.target.value })}
              className={`${inputClass} mt-0 font-mono`}
            />
            <select
              aria-label="Kind"
              value={row.kind}
              onChange={(event) =>
                update(index, {
                  kind: event.target.value as DeliverableKind,
                  ...(event.target.value === "file" ? {} : { path: "" }),
                })
              }
              className={`${inputClass} mt-0`}
            >
              {DELIVERABLE_KINDS.map(({ kind, label }) => (
                <option key={kind} value={kind}>
                  {label}
                </option>
              ))}
            </select>
            <input
              aria-label="What it is"
              placeholder="What it is"
              value={row.description}
              onChange={(event) =>
                update(index, { description: event.target.value })
              }
              className={`${inputClass} mt-0`}
            />
            {row.kind === "file" ? (
              <input
                aria-label="File name"
                placeholder="File name, e.g. report-*.md (optional)"
                value={row.path}
                onChange={(event) =>
                  update(index, { path: event.target.value })
                }
                className={`${inputClass} mt-0 font-mono sm:col-span-2`}
              />
            ) : null}
            <div className="flex items-center gap-4 sm:col-span-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={row.primary}
                  onChange={(event) =>
                    update(index, { primary: event.target.checked })
                  }
                />
                The main outcome
              </label>
              <button
                type="button"
                onClick={() =>
                  setRows((current) => current.filter((_, i) => i !== index))
                }
                className="text-zinc-500 underline"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {rows.length < BRIEF_LIMITS.deliverables ? (
        <button
          type="button"
          onClick={() => setRows((current) => [...current, emptyRow()])}
          className="mt-2 underline"
        >
          Add a deliverable
        </button>
      ) : null}
    </fieldset>
  );
}

/** The rows a refused form sent back, so they aren't lost. */
function rowsOf(json: string | undefined): Row[] {
  if (!json) return [];
  try {
    const rows = JSON.parse(json) as Partial<Row>[];
    return Array.isArray(rows)
      ? rows.map((row) => ({ ...emptyRow(), ...row }))
      : [];
  } catch {
    return [];
  }
}
