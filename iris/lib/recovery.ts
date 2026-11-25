/**
 * Pure helpers for the error screens (`app/components/recovering.tsx`):
 * which services Iris's `/health` says are down, and when to try a page
 * again.
 */

/** The part of Iris's `/health` (`lib/health.ts`) the error screens read. */
export interface HealthSnapshot {
  checks?: Record<string, { status?: string }>;
}

/** The services that don't answer, by name ("pistis" → "Pistis"). */
export function downServices(health: HealthSnapshot): string[] {
  return Object.entries(health.checks ?? {})
    .filter(([, check]) => check.status !== "up")
    .map(([name]) => name.charAt(0).toUpperCase() + name.slice(1));
}

/** How often to look at `/health` while services are down. */
export const POLL_MS = 3000;

/**
 * Tries of a page with every service up before it counts as a real error
 * (not one waiting to start), within `GIVE_UP_WINDOW_MS`.
 */
export const MAX_TRIES_WHILE_UP = 3;
export const GIVE_UP_WINDOW_MS = 60_000;

/**
 * Whether to stop trying a page by itself: it failed `MAX_TRIES_WHILE_UP`
 * times in the last `GIVE_UP_WINDOW_MS` although every service answered.
 */
export function shouldGiveUp(triesWhileUp: number[], now: number): boolean {
  return (
    triesWhileUp.filter((at) => now - at < GIVE_UP_WINDOW_MS).length >=
    MAX_TRIES_WHILE_UP
  );
}

/**
 * The tries kept in this tab's `sessionStorage` (`TRIES_KEY`), by page, so
 * they survive a reload: `/unavailable` reloads the page to try it again,
 * which would otherwise forget them and reload forever.
 */
export const TRIES_KEY = "iris-recovery-tries";

/** The stored tries, recent ones only, from their JSON (anything else is none). */
export function storedTries(raw: string | null, now: number): Record<string, number[]> {
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const tries: Record<string, number[]> = {};
  for (const [page, times] of Object.entries(parsed)) {
    if (!Array.isArray(times)) continue;
    const recent = times.filter(
      (at): at is number => typeof at === "number" && now - at < GIVE_UP_WINDOW_MS,
    );
    if (recent.length > 0) tries[page] = recent;
  }
  return tries;
}
