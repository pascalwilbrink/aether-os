import { describe, expect, it } from "vitest";

import type { Artifact, Execution } from "./api";
import {
  artifactsByExecution,
  blockedHosts,
  drafts,
  failureLabel,
  formatCost,
  formatCount,
  formatTime,
  isTaskStatus,
  networkLabel,
  statusClasses,
  statusLabel,
  TASK_STATUSES,
  taskActions,
  taskContextOf,
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
    expect(taskActions({ status: "running" })).toEqual({
      cancel: true,
      retry: false,
    });
    expect(taskActions({ status: "failed" })).toEqual({
      cancel: false,
      retry: true,
    });
    expect(taskActions({ status: "succeeded" })).toEqual({
      cancel: false,
      retry: false,
    });
  });

  it("explains failures", () => {
    expect(failureLabel("verification_failed")).toBe(
      "Acceptance criteria still failing",
    );
    expect(failureLabel(null)).toBeNull();
  });

  it("finds the drafts", () => {
    const artifacts = [{ status: "draft" }, { status: "final" }] as Artifact[];
    expect(drafts(artifacts)).toEqual([{ status: "draft" }]);
  });

  it("formats counts and times the same everywhere", () => {
    expect(formatCount(12345)).toBe("12,345");
    expect(formatCost(null)).toBe("—");
    expect(formatCost("0.000000")).toBe("$0");
    expect(formatCost("0.000040")).toBe("< $0.0001");
    expect(formatCost("0.002260")).toBe("$0.0023");
    expect(formatCost("12.345600")).toBe("$12.35");
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

  it("names an execution's network and gathers the hosts its sandboxes were refused", () => {
    const sandbox = (networkAccess: string, hosts: string[]) => ({
      workspaceId: "w",
      networkAccess,
      allowedHosts: [],
      blockedHosts: hosts,
    });
    const executions = [
      {
        number: 3,
        sandbox: sandbox("restricted", ["example.com", "api.github.com"]),
      },
      { number: 2, sandbox: null },
      { number: 1, sandbox: sandbox("restricted", ["example.com"]) },
      { number: 4, sandbox: sandbox("none", []) },
    ] as Execution[];

    expect(executions.map(networkLabel)).toEqual([
      "Allowed hosts",
      "No sandbox",
      "Allowed hosts",
      "No network",
    ]);
    expect(blockedHosts(executions)).toEqual([
      { host: "api.github.com", executions: [3] },
      { host: "example.com", executions: [1, 3] },
    ]);
    expect(blockedHosts([])).toEqual([]);
  });
});

describe("taskContextOf", () => {
  it("pins each checked item once", () => {
    expect(taskContextOf(["a", "b", "a", ""])).toEqual({
      context: [
        { kind: "knowledge", itemId: "a" },
        { kind: "knowledge", itemId: "b" },
      ],
    });
    expect(taskContextOf([])).toEqual({ context: [] });
  });

  it("refuses more than 50", () => {
    const many = Array.from({ length: 51 }, (_, i) => `item-${i}`);
    expect(taskContextOf(many)).toEqual({
      error: "A task pins at most 50 knowledge items; 51 are checked.",
    });
  });
});
