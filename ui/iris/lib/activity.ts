import type { ExecutionEvent, ExecutionEventPage } from "@/lib/api";

/** How often a running execution's activity is asked for again. */
export const ACTIVITY_POLL_MS = 2000;

/** Whether an execution can still do something (its activity can grow). */
export function isActive(
  status: ExecutionEventPage["executionStatus"],
): boolean {
  return status === "provisioning" || status === "running";
}

/** Events seen so far plus new ones: each once, in order. */
export function mergeEvents(
  seen: ExecutionEvent[],
  incoming: ExecutionEvent[],
): ExecutionEvent[] {
  const bySequence = new Map(seen.map((event) => [event.sequence, event]));
  for (const event of incoming) {
    bySequence.set(event.sequence, event);
  }
  return [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
}

/** A short label for an event's kind. */
export function eventKind(event: ExecutionEvent): string {
  switch (event.type) {
    case "model_call":
      return "Model";
    case "tool_call":
      return "Tool";
    default:
      return "Runner";
  }
}

/** The time of day an event happened (hours, minutes, seconds), in UTC. */
export function eventTime(createdAt: string): string {
  return new Date(createdAt).toISOString().slice(11, 19);
}

/** Whether an event has more to show than its line. */
export function hasDetails(event: ExecutionEvent): boolean {
  return Boolean(event.input || event.output || event.text);
}
