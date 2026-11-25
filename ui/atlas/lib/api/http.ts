import "server-only";

import { redirect } from "next/navigation";

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

/** The problem code of a service that can't be reached or answers 502–504. */
export const SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE";

const UNAVAILABLE_STATUSES = new Set([502, 503, 504]);

/**
 * A JSON call to an Aether-os API with the session's access token. A
 * service that doesn't answer (refused, timed out) or answers 502–504 is an
 * `ApiError` with status 503 and `SERVICE_UNAVAILABLE`. A `401` (the token
 * is invalid or expired) signs out of Atlas (`/auth/expired`).
 */
export async function call<T>(
  base: string,
  path: string,
  token: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(new URL(path, base), {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        ...(init.body === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.warn(`No answer from ${new URL(path, base).origin}`, error);
    throw new ApiError(
      503,
      SERVICE_UNAVAILABLE,
      "Polis can't be reached right now. It may still be starting: try again in a moment.",
    );
  }
  if (response.status === 401) {
    redirect(`/auth/expired?token=${tokenFingerprint(token)}`);
  }
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as {
      code?: string;
      detail?: string;
    };
    throw new ApiError(
      UNAVAILABLE_STATUSES.has(response.status) ? 503 : response.status,
      problem.code ??
        (UNAVAILABLE_STATUSES.has(response.status)
          ? SERVICE_UNAVAILABLE
          : undefined),
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
 * Every item of a cursor-paginated list (an organization's departments,
 * teams or persons: hundreds at most), page by page.
 */
export async function all<T>(
  fetchPage: (cursor: string | null) => Promise<Page<T>>,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const page: Page<T> = await fetchPage(cursor);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}
