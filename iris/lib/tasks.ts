import type { Artifact, Execution, Task, TaskStatus } from "./api";

type Tone = "neutral" | "active" | "waiting" | "good" | "bad";

const STATUS: Record<TaskStatus, { label: string; tone: Tone }> = {
  blocked: { label: "Blocked", tone: "neutral" },
  queued: { label: "Queued", tone: "neutral" },
  provisioning: { label: "Starting", tone: "active" },
  running: { label: "Running", tone: "active" },
  verifying: { label: "Verifying", tone: "active" },
  awaiting_review: { label: "Awaiting review", tone: "waiting" },
  waiting: { label: "Waiting for subtasks", tone: "waiting" },
  paused: { label: "Paused", tone: "waiting" },
  delivering: { label: "Delivering", tone: "active" },
  succeeded: { label: "Succeeded", tone: "good" },
  failed: { label: "Failed", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** Every status, in lifecycle order (for the filter). */
export const TASK_STATUSES = Object.keys(STATUS) as TaskStatus[];

export function statusLabel(status: TaskStatus): string {
  return STATUS[status].label;
}

/** Tailwind classes for a status badge. */
export function statusClasses(status: TaskStatus): string {
  return {
    neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    active: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
    waiting:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    bad: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  }[STATUS[status].tone];
}

/** Whether the status filter's value is a real status. */
export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && Object.hasOwn(STATUS, value);
}

const FAILURES: Record<NonNullable<Task["failureReason"]>, string> = {
  agent_failed: "The agent gave up",
  verification_failed: "Acceptance criteria still failing",
  rejected: "A draft was rejected",
  timeout: "It took too long",
  budget_exceeded: "Its budget ran out",
  infrastructure: "Infrastructure kept failing",
  subtask_failed: "A subtask failed",
  access_denied: "Its service account isn't allowed in this project",
};

export function failureLabel(reason: Task["failureReason"]): string | null {
  return reason ? FAILURES[reason] : null;
}

/** What people can do with a task in its current state (the API decides too). */
export function taskActions(task: Pick<Task, "status">): {
  cancel: boolean;
  retry: boolean;
} {
  const finished = ["succeeded", "failed", "cancelled"].includes(task.status);
  return { cancel: !finished, retry: task.status === "failed" };
}

/** The drafts waiting for a decision. */
export function drafts(artifacts: Artifact[]): Artifact[] {
  return artifacts.filter((artifact) => artifact.status === "draft");
}

/** `1,234` style, for token counts. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

/**
 * A cost in US dollars (a 6-decimal string from the API): cents above a
 * dollar, up to 4 decimals below it (`$0.0023`), `—` when unpriced.
 */
export function formatCost(usd: string | null): string {
  if (usd === null) return "—";
  const value = Number(usd);
  if (value === 0) return "$0";
  if (value < 0.0001) return "< $0.0001";
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`;
}

/** A timestamp as people read it (UTC, so server and browser agree). */
export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * A task's artifacts under the execution that produced them, newest
 * execution first; within one, what the agent produced before the checks.
 */
export function artifactsByExecution(
  executions: Execution[],
  artifacts: Artifact[],
): { execution: Execution; items: Artifact[] }[] {
  return [...executions]
    .sort((a, b) => b.number - a.number)
    .map((execution) => ({
      execution,
      items: artifacts
        .filter((artifact) => artifact.executionId === execution.id)
        .sort(
          (a, b) =>
            Number(a.kind === "verification") -
            Number(b.kind === "verification"),
        ),
    }))
    .filter((group) => group.items.length > 0);
}

/** What an execution's sandbox could reach, in a word: none without a sandbox. */
export function networkLabel(execution: Execution): string {
  if (!execution.sandbox) return "No sandbox";
  return execution.sandbox.networkAccess === "restricted"
    ? "Allowed hosts"
    : "No network";
}

/**
 * The hosts the task's sandboxes tried to reach and were refused, each with
 * the executions (numbers, oldest first) it happened in; by host.
 */
export function blockedHosts(
  executions: Execution[],
): { host: string; executions: number[] }[] {
  const byHost = new Map<string, number[]>();
  for (const execution of executions) {
    for (const host of execution.sandbox?.blockedHosts ?? []) {
      byHost.set(host, [...(byHost.get(host) ?? []), execution.number]);
    }
  }
  return [...byHost]
    .map(([host, numbers]) => ({
      host,
      executions: numbers.sort((a, b) => a - b),
    }))
    .sort((a, b) => a.host.localeCompare(b.host));
}
