import { describe, expect, it } from "vitest";

import type { ExecutionEvent } from "@/lib/api";

import {
  eventKind,
  eventTime,
  hasDetails,
  isActive,
  mergeEvents,
} from "./activity";

const event = (
  sequence: number,
  extra: Partial<ExecutionEvent> = {},
): ExecutionEvent => ({
  sequence,
  type: "log",
  level: "info",
  message: `event ${sequence}`,
  toolName: null,
  input: null,
  output: null,
  text: null,
  inputTokens: null,
  outputTokens: null,
  createdAt: "2026-11-20T09:15:42.123Z",
  ...extra,
});

describe("activity", () => {
  it("follows only executions that can still change", () => {
    expect(isActive("provisioning")).toBe(true);
    expect(isActive("running")).toBe(true);
    expect(isActive("completed")).toBe(false);
    expect(isActive("paused")).toBe(false);
  });

  it("keeps each event once, in order", () => {
    expect(
      mergeEvents([event(1), event(2)], [event(2), event(4), event(3)]).map(
        (e) => e.sequence,
      ),
    ).toEqual([1, 2, 3, 4]);
  });

  it("labels and times events", () => {
    expect(eventKind(event(1, { type: "tool_call" }))).toBe("Tool");
    expect(eventKind(event(1, { type: "model_call" }))).toBe("Model");
    expect(eventKind(event(1))).toBe("Runner");
    expect(eventTime("2026-11-20T09:15:42.123Z")).toBe("09:15:42");
    expect(hasDetails(event(1))).toBe(false);
    expect(hasDetails(event(1, { output: "ok" }))).toBe(true);
  });
});
