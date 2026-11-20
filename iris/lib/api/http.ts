import "server-only";

import { redirect, unstable_rethrow } from "next/navigation";

import { tokenFingerprint } from "../auth/session";

/**
 * A problem details error (RFC 9457) from an Aether-os API, with its
 * `code`, so pages can tell "not found" from "forbidden" from a business
 * rule.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    detail: string,
  ) {
    super(detail);
  }
}

/** A JSON call to an Aether-os API with the session's access token. */
export async function call<T>(
  base: string,
  path: string,
  token: string,
  init: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const response = await fetch(new URL(path, base), {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(init.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401) {
    // The token is invalid or expired (e.g. Pistis's keys changed, or the
    // session was revoked): the session is no use any more, so sign out.
    redirect(`/auth/expired?token=${tokenFingerprint(token)}`);
  }
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as {
      code?: string;
      detail?: string;
    };
    throw new ApiError(
      response.status,
      problem.code,
      problem.detail ?? `${response.status} ${response.statusText}`,
    );
  }
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}

/** A page of a cursor-paginated list. */
export type Page<T> = { items: T[]; nextCursor: string | null };

/**
 * A list from a service that can be down without breaking the page (Proxenos,
 * Kairos), or `unavailable` when it (or GitHub behind it) can't answer, or
 * isn't configured: pages show the rest without it. A
 * caller without the permission gets an empty list.
 */
export async function orUnavailable<T>(
  promise: Promise<Page<T>>,
): Promise<{ items: T[]; unavailable: boolean }> {
  try {
    return { items: (await promise).items, unavailable: false };
  } catch (error) {
    // A redirect (signing out after a 401) isn't the service being unavailable.
    unstable_rethrow(error);
    if (error instanceof ApiError && error.status === 403) {
      return { items: [], unavailable: false };
    }
    if (error instanceof ApiError && error.status < 500) {
      throw error;
    }
    // Unreachable (a fetch error or timeout), 503 (not configured, GitHub down) or another 5xx.
    return { items: [], unavailable: true };
  }
}
