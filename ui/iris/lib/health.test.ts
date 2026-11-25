import { describe, expect, it } from "vitest";

import { summarize, type DependencyCheck } from "./health";

const up = (required = false): DependencyCheck => ({
  status: "up",
  required,
  latencyMs: 3,
});
const down = (required = false): DependencyCheck => ({
  status: "down",
  required,
  latencyMs: 1500,
  error: "no answer",
});

describe("summarize", () => {
  it("is ok when every service answers", () => {
    expect(summarize({ pistis: up(true), polis: up() }).status).toBe("ok");
  });

  it("is degraded when a service other than Pistis is down", () => {
    expect(summarize({ pistis: up(true), polis: down() }).status).toBe(
      "degraded",
    );
  });

  it("is down without Pistis", () => {
    const health = summarize({ pistis: down(true), polis: up() });
    expect(health).toEqual({
      status: "down",
      service: "iris",
      checks: { pistis: down(true), polis: up() },
    });
  });
});
