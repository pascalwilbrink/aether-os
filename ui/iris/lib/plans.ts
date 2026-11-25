import type { CouncilPlan, CouncilPlanEntry, Task, TaskOrigin } from "./api";

/**
 * A council's plans in Iris (docs/councils.md, Planning and delegation):
 * how a plan reads, its entries grouped by milestone, the tasks an approved
 * one became, the reviewer's changed assignments, and where a task came
 * from. Pure, so it can be tested.
 */

type PlanStatus = CouncilPlan["status"];

const STATUS: Record<PlanStatus, { label: string; classes: string }> = {
  proposed: {
    label: "Waiting for your review",
    classes: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  approved: {
    label: "Approved",
    classes: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  },
  changes_requested: {
    label: "Changes requested",
    classes: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  },
  rejected: {
    label: "Rejected",
    classes: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  },
  superseded: {
    label: "Replaced by a newer plan",
    classes: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
};

/** A plan's status, in words, with its badge's colours. */
export const planStatus = (status: PlanStatus) => STATUS[status];

/** The plan's entries under their milestones, in the plan's order; entries without one last. */
export function planEntryGroups(
  plan: Pick<CouncilPlan, "milestones" | "entries">,
): { milestone: CouncilPlan["milestones"][number] | null; entries: CouncilPlanEntry[] }[] {
  const groups = plan.milestones
    .map((milestone) => ({
      milestone,
      entries: plan.entries.filter((entry) => entry.milestoneKey === milestone.key),
    }))
    .filter((group) => group.entries.length > 0);
  const loose = plan.entries.filter(
    (entry) =>
      !entry.milestoneKey ||
      !plan.milestones.some((milestone) => milestone.key === entry.milestoneKey),
  );
  return loose.length > 0 ? [...groups, { milestone: null, entries: loose }] : groups;
}

/** An approved plan's subtasks by the entry each one is. */
export function tasksByEntry(subtasks: readonly Task[]): Map<string, Task> {
  const byEntry = new Map<string, Task>();
  for (const task of subtasks) {
    const key = task.origin?.entryKey;
    if (key) byEntry.set(key, task);
  }
  return byEntry;
}

/**
 * The entries the reviewer gave to another member: the form's `agent:<entry
 * key>` fields that differ from the plan, only for its entries and members.
 */
export function changedAssignments(
  plan: { entries: readonly Pick<CouncilPlanEntry, "key" | "agentId">[] },
  memberIds: readonly string[],
  values: Readonly<Record<string, string>>,
): { entryKey: string; agentId: string }[] {
  return plan.entries.flatMap((entry) => {
    const chosen = values[`agent:${entry.key}`];
    return chosen && chosen !== entry.agentId && memberIds.includes(chosen)
      ? [{ entryKey: entry.key, agentId: chosen }]
      : [];
  });
}

/** Where a task from a council's plan came from, in words (the session is linked beside it). */
export function originLabel(
  origin: TaskOrigin,
  person: (sub: string) => string,
): string {
  if (!origin.entryKey) {
    return "The plan task of a council's plan: it finishes when its subtasks do.";
  }
  const assigned =
    origin.assignedBy === "facilitator"
      ? `Assigned by the facilitator${origin.reason ? `: ${origin.reason}` : "."}`
      : origin.assignedBy
        ? `Assigned by ${person(origin.assignedBy)} when approving the plan.`
        : "";
  return `Entry "${origin.entryKey}" of a council's plan. ${assigned}`.trim();
}
