import { describe, expect, it } from "vitest";

import { downServices, GIVE_UP_WINDOW_MS, shouldGiveUp } from "./recovery";

describe("downServices", () => {
  it("names the services that don't answer", () => {
    expect(
      downServices({
        checks: {
          pistis: { status: "down" },
          polis: { status: "up" },
          agora: { status: "down" },
        },
      }),
    ).toEqual(["Pistis", "Agora"]);
  });

  it("is empty when everything answers, or nothing was reported", () => {
    expect(downServices({ checks: { polis: { status: "up" } } })).toEqual([]);
    expect(downServices({})).toEqual([]);
  });
});

describe("shouldGiveUp", () => {
  const now = 1_000_000;

  it("keeps trying until a page failed three times with everything up", () => {
    expect(shouldGiveUp([], now)).toBe(false);
    expect(shouldGiveUp([now - 2000, now - 1000], now)).toBe(false);
    expect(shouldGiveUp([now - 3000, now - 2000, now - 1000], now)).toBe(true);
  });

  it("forgets tries older than the window", () => {
    const old = now - GIVE_UP_WINDOW_MS - 1;
    expect(shouldGiveUp([old, old, now - 1000], now)).toBe(false);
  });
});
