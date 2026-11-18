import { describe, expect, it } from "vitest";

import { budgetSummary, limitField, parseLimit, pausedMessage, type Budget } from "./budgets";

const budget = (limitUsd: string | null, spentUsd: string): Budget => ({
  scope: "project",
  scopeId: "project-1",
  limitUsd,
  spentUsd,
  windowStart: "2026-11-01T00:00:00.000Z",
  thresholdPercent: 80,
  updatedAt: null,
});

describe("parseLimit", () => {
  it("reads amounts in dollars, and empty as no limit", () => {
    expect(parseLimit("25")).toEqual({ limitUsd: "25" });
    expect(parseLimit(" $1,000.50 ")).toEqual({ limitUsd: "1000.50" });
    expect(parseLimit("0.000001")).toEqual({ limitUsd: "0.000001" });
    expect(parseLimit("")).toEqual({ limitUsd: null });
    expect(parseLimit(undefined)).toEqual({ limitUsd: null });
  });

  it.each(["-5", "ten", "1.1234567", "1e3", "1234567890"])("refuses %s", (text) => {
    expect(parseLimit(text)).toEqual({ error: expect.stringContaining("US dollars") });
  });
});

describe("budgets as people read them", () => {
  it("starts a form from the limit", () => {
    expect(limitField(budget("25.500000", "0"))).toBe("25.5");
    expect(limitField(budget("10.000000", "0"))).toBe("10");
    expect(limitField(budget(null, "0"))).toBe("");
  });

  it("shows spent against the limit, near it and over it", () => {
    expect(budgetSummary(budget(null, "1.250000"))).toEqual({
      spent: "$1.25",
      limit: "no limit",
      percent: null,
      tone: "none",
    });
    expect(budgetSummary(budget("10.000000", "2.500000"))).toMatchObject({ percent: 25, tone: "ok" });
    expect(budgetSummary(budget("10.000000", "8.000000"))).toMatchObject({ percent: 80, tone: "warning" });
    expect(budgetSummary(budget("10.000000", "12.000000"))).toMatchObject({
      limit: "$10.00",
      percent: 100,
      tone: "exceeded",
    });
    expect(budgetSummary(budget("0.000000", "0.000000"))).toMatchObject({ percent: 100, tone: "exceeded" });
  });

  it("says why a task is paused and what resumes it", () => {
    expect(pausedMessage("task_tree")).toBe(
      "Paused: this task tree's budget ran out. It resumes once the budget is raised.",
    );
    expect(pausedMessage("organization")).toContain("or when the next month starts");
  });
});
