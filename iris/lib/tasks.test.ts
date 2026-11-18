import { describe, expect, it } from "vitest";

import type { Artifact, Execution } from "./api";
import {
  artifactsByExecution,
  drafts,
  failureLabel,
  formatCount,
  formatTime,
  isTaskStatus,
  statusClasses,
  statusLabel,
  TASK_STATUSES,
  taskActions,
} from "./tasks";

describe("task helpers", () => {
  it("labels every status", () => {
    expect(TASK_STATUSES).toHaveLength(12);
    for (const status of TASK_STATUSES) {
      expect(statusLabel(status)).not.toBe("");
      expect(statusClasses(status)).toMatch(/^bg-/);
    }
    expect(statusLabel("awaiting_review")).toBe("Awaiting review");
  });

  it("accepts only real statuses as a filter", () => {
    expect(isTaskStatus("running")).toBe(true);
    expect(isTaskStatus("toString")).toBe(false);
    expect(isTaskStatus(undefined)).toBe(false);
  });

  it("offers cancel until a task is finished, and retry only after a failure", () => {
    expect(taskActions({ status: "running" })).toEqual({ cancel: true, retry: false });
    expect(taskActions({ status: "failed" })).toEqual({ cancel: false, retry: true });
    expect(taskActions({ status: "succeeded" })).toEqual({ cancel: false, retry: false });
  });

  it("explains failures", () => {
    expect(failureLabel("verification_failed")).toBe("Acceptance criteria still failing");
    expect(failureLabel(null)).toBeNull();
  });

  it("finds the drafts", () => {
    const artifacts = [{ status: "draft" }, { status: "final" }] as Artifact[];
    expect(drafts(artifacts)).toEqual([{ status: "draft" }]);
  });

  it("formats counts and times the same everywhere", () => {
    expect(formatCount(12345)).toBe("12,345");
    expect(formatTime("2026-11-18T09:05:12.000Z")).toBe("2026-11-18 09:05 UTC");
    expect(formatTime(null)).toBe("—");
  });

  it("groups artifacts by execution, newest first, checks last", () => {
    const executions = [
      { id: "e1", number: 1 },
      { id: "e2", number: 2 },
      { id: "e3", number: 3 },
    ] as Execution[];
    const artifacts = [
      { id: "v1", executionId: "e1", kind: "verification" },
      { id: "a1", executionId: "e1", kind: "text" },
      { id: "a2", executionId: "e2", kind: "json" },
    ] as Artifact[];
    expect(
      artifactsByExecution(executions, artifacts).map((group) => [
        group.execution.number,
        group.items.map((artifact) => artifact.id),
      ]),
    ).toEqual([
      [2, ["a2"]],
      [1, ["a1", "v1"]],
    ]);
  });
});
