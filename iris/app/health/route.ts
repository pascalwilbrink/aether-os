import { NextResponse } from "next/server";

import { summarize, type DependencyCheck } from "@/lib/health";

import { SERVICES } from "../orgs/[organizationId]/sidebar/services";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 3000;

/**
 * Iris's health (`docs/engineering.md`, Health checks): whether each service
 * it calls runs (its `/health/live`). `503` without Pistis.
 */
export async function GET() {
  const results = await Promise.all(
    SERVICES().map(
      async ({ name, url }) =>
        [name.toLowerCase(), await probe(name, url)] as const,
    ),
  );
  const health = summarize(Object.fromEntries(results));
  return NextResponse.json(health, {
    status: health.status === "down" ? 503 : 200,
    headers: { "cache-control": "no-store" },
  });
}

async function probe(name: string, url: string): Promise<DependencyCheck> {
  const required = name === "Pistis";
  const started = performance.now();
  const latency = () => Math.round(performance.now() - started);
  try {
    const response = await fetch(new URL("/health/live", url), {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    await response.body?.cancel();
    return response.ok
      ? { status: "up", required, latencyMs: latency() }
      : {
          status: "down",
          required,
          latencyMs: latency(),
          error: `answered HTTP ${response.status}`,
        };
  } catch (error) {
    return {
      status: "down",
      required,
      latencyMs: latency(),
      error:
        error instanceof Error && error.name === "TimeoutError"
          ? `no answer in ${TIMEOUT_MS} ms`
          : "unreachable",
    };
  }
}
