import { describe, expect, it } from "vitest";

import { cardPosition, TOUR_STEPS, tourOpen } from "./tour";

const rect = (top: number, left: number, width = 240, height = 40) => ({
  top,
  left,
  right: left + width,
  bottom: top + height,
  width,
  height,
});

describe("tour", () => {
  it("starts with a welcome and ends with the first task's checklist", () => {
    expect(TOUR_STEPS[0]).toMatchObject({ id: "welcome", target: null });
    const last = TOUR_STEPS[TOUR_STEPS.length - 1];
    expect(last).toMatchObject({ id: "first-task", target: null });
    expect(last.todo?.map((item) => item.path)).toEqual(["/model-keys", "/agents/new", "/members", "/projects"]);
    expect(new Set(TOUR_STEPS.map((step) => step.id)).size).toBe(TOUR_STEPS.length);
  });

  it("opens for someone who never finished it, and when asked again", () => {
    expect(tourOpen(null)).toBe(true);
    expect(tourOpen("open")).toBe(true);
    expect(tourOpen("done")).toBe(false);
  });

  it("puts the card beside its target, inside the window", () => {
    const viewport = { width: 1280, height: 800 };
    const card = { width: 320, height: 200 };
    expect(cardPosition(rect(300, 12), viewport, card)).toEqual({ top: 300, left: 268 });
    // Near the bottom: moved up to stay inside.
    expect(cardPosition(rect(760, 12), viewport, card)).toEqual({ top: 584, left: 268 });
    // Near the top: kept off the edge.
    expect(cardPosition(rect(4, 12), viewport, card)).toEqual({ top: 16, left: 268 });
  });

  it("centres it without a visible target or room beside it", () => {
    const card = { width: 320, height: 200 };
    expect(cardPosition(null, { width: 1280, height: 800 }, card)).toBe("center");
    expect(cardPosition(rect(300, 0, 0, 0), { width: 1280, height: 800 }, card)).toBe("center");
    expect(cardPosition(rect(300, 12), { width: 500, height: 800 }, card)).toBe("center");
  });
});
