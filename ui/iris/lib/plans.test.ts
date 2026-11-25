import { describe, expect, it } from "vitest";

import type { CouncilPlan, Task } from "./api";
import {
  changedAssignments,
  originLabel,
  planEntryGroups,
  planStatus,
  tasksByEntry,
} from "./plans";

const entry = (key: string, agentId: string, milestoneKey?: string) => ({
  key,
  title: key,
  description: `Do ${key}`,
  agentId,
  ...(milestoneKey ? { milestoneKey } : {}),
});

const plan: Pick<CouncilPlan, "milestones" | "entries"> = {
  milestones: [
    { key: "design", title: "Design" },
    { key: "empty", title: "Nothing here" },
    { key: "build", title: "Build", dependsOn: ["design"] },
  ],
  entries: [
    entry("implement", "builder", "build"),
    entry("flow", "architect", "design"),
    entry("docs", "architect"),
    entry("stray", "builder", "gone"),
  ],
};

describe("plans", () => {
  it("says what a plan's status means", () => {
    expect(planStatus("proposed").label).toBe("Waiting for your review");
    expect(planStatus("superseded").label).toBe("Replaced by a newer plan");
  });

  it("groups entries under their milestones, in the plan's order, the rest last", () => {
    expect(
      planEntryGroups(plan).map((group) => [
        group.milestone?.key ?? null,
        group.entries.map((candidate) => candidate.key),
      ]),
    ).toEqual([
      ["design", ["flow"]],
      ["build", ["implement"]],
      [null, ["docs", "stray"]],
    ]);
    expect(planEntryGroups({ milestones: [], entries: [] })).toEqual([]);
  });

  it("finds an approved plan's subtasks by entry", () => {
    const task = (id: string, entryKey: string | null) =>
      ({ id, origin: entryKey ? { entryKey } : null }) as unknown as Task;
    const byEntry = tasksByEntry([task("t1", "flow"), task("t2", null), task("t3", "implement")]);
    expect([...byEntry.keys()]).toEqual(["flow", "implement"]);
    expect(byEntry.get("implement")?.id).toBe("t3");
  });

  it("keeps only real changes to members of the council", () => {
    expect(
      changedAssignments(plan, ["architect", "builder"], {
        "agent:implement": "builder",
        "agent:flow": "builder",
        "agent:docs": "stranger",
        "agent:missing": "architect",
      }),
    ).toEqual([{ entryKey: "flow", agentId: "builder" }]);
  });

  it("says where a task from a plan came from", () => {
    const origin = {
      kind: "council-plan" as const,
      sessionId: "s",
      planId: "p",
      entryKey: "flow",
      outcomeEntryKey: null,
      assignedBy: "facilitator",
      reason: "The architect designs flows.",
    };
    const person = (sub: string) => (sub === "u-1" ? "you" : sub);
    expect(originLabel(origin, person)).toBe(
      'Entry "flow" of a council\'s plan. Assigned by the facilitator: The architect designs flows.',
    );
    expect(originLabel({ ...origin, assignedBy: "u-1", reason: null }, person)).toBe(
      'Entry "flow" of a council\'s plan. Assigned by you when approving the plan.',
    );
    expect(
      originLabel(
        { ...origin, entryKey: null, outcomeEntryKey: "flow", assignedBy: null, reason: null },
        person,
      ),
    ).toContain("The plan task");
  });
});
