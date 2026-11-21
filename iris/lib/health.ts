/** One service Iris calls, as Iris's `/health` reports it. */
export interface DependencyCheck {
  status: "up" | "down";
  required: boolean;
  latencyMs: number;
  error?: string;
}

export interface IrisHealth {
  status: "ok" | "degraded" | "down";
  service: "iris";
  checks: Record<string, DependencyCheck>;
}

/**
 * Iris's health, in the services' format (`docs/engineering.md`, Health
 * checks): `down` without Pistis, since nobody can sign in then;
 * `degraded` when another service is down, as its pages fail.
 */
export function summarize(checks: Record<string, DependencyCheck>): IrisHealth {
  const failed = Object.values(checks).filter(
    (check) => check.status === "down",
  );
  return {
    status: failed.some((check) => check.required)
      ? "down"
      : failed.length > 0
        ? "degraded"
        : "ok",
    service: "iris",
    checks,
  };
}
