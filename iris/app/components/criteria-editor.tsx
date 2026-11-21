"use client";

import { useState } from "react";

import { inputClass } from "@/app/components/form";
import type { CriterionRow } from "@/lib/templates";

const emptyRow = (): CriterionRow => ({
  key: "",
  description: "",
  type: "command",
  command: "",
});

/**
 * A template's acceptance criteria (docs/tasks.md, Definition of done): a
 * row each, checked by a command in the task's sandbox (exit code 0 passes)
 * or by the reviewer, sent as JSON in the `criteria` field and checked by
 * the Server Function (`criteriaFromJson`). Deliverables add their own.
 */
export function CriteriaEditor({ initial }: { initial?: string }) {
  const [rows, setRows] = useState<CriterionRow[]>(() => rowsOf(initial));
  const update = (index: number, change: Partial<CriterionRow>) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...change } : row)),
    );
  return (
    <fieldset className="text-sm">
      <legend>
        Acceptance criteria <span className="text-zinc-500">(optional)</span>
      </legend>
      <input type="hidden" name="criteria" value={JSON.stringify(rows)} />
      <p className="text-xs text-zinc-500">
        How a task from it is checked before it can succeed; failures go back to
        the agent. A command runs in the task&apos;s sandbox (its agent version
        needs one) and passes with exit code 0.
      </p>
      <ul className="mt-2 space-y-2">
        {rows.map((row, index) => (
          <li
            key={index}
            className="grid gap-2 rounded-md border border-zinc-200 p-2 sm:grid-cols-[9rem_1fr_9rem] dark:border-zinc-800"
          >
            <input
              aria-label="Key"
              placeholder="tests-pass"
              value={row.key}
              onChange={(event) => update(index, { key: event.target.value })}
              className={`${inputClass} mt-0 font-mono`}
            />
            <input
              aria-label="What it checks"
              placeholder="The tests pass"
              value={row.description}
              onChange={(event) =>
                update(index, { description: event.target.value })
              }
              className={`${inputClass} mt-0`}
            />
            <select
              aria-label="Checked by"
              value={row.type}
              onChange={(event) =>
                update(index, {
                  type: event.target.value as CriterionRow["type"],
                })
              }
              className={`${inputClass} mt-0`}
            >
              <option value="command">A command</option>
              <option value="manual">The reviewer</option>
            </select>
            {row.type === "command" ? (
              <input
                aria-label="Command"
                placeholder="pnpm test"
                value={row.command}
                onChange={(event) =>
                  update(index, { command: event.target.value })
                }
                className={`${inputClass} mt-0 font-mono sm:col-span-2`}
              />
            ) : null}
            <button
              type="button"
              onClick={() =>
                setRows((current) => current.filter((_, i) => i !== index))
              }
              className="justify-self-start text-zinc-500 underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {rows.length < 50 ? (
        <button
          type="button"
          onClick={() => setRows((current) => [...current, emptyRow()])}
          className="mt-2 underline"
        >
          Add a criterion
        </button>
      ) : null}
    </fieldset>
  );
}

/** The rows a version or a refused form had, so they aren't lost. */
function rowsOf(json: string | undefined): CriterionRow[] {
  if (!json) return [];
  try {
    const rows = JSON.parse(json) as Partial<CriterionRow>[];
    return Array.isArray(rows)
      ? rows.map((row) => ({ ...emptyRow(), ...row }))
      : [];
  } catch {
    return [];
  }
}
