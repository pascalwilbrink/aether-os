/** How long to wait for a service's `/health/live`. */
export const HEALTH_TIMEOUT_MS = 2_000;

/** Whether a service answers its `/health/live` (running, not necessarily healthy). */
export async function isRunning(
  url: string,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<boolean> {
  try {
    const response = await fetch(new URL("/health/live", url), {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}
