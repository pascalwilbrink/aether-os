import "server-only";

import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";

import { currentSession } from "../auth/current";
import {
  PATH_HEADER,
  refreshAfterForbidden,
  tokenFingerprint,
} from "@aether-os/sign-in";
import { serviceNameFor } from "../services";

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

/** Statuses meaning "not now": a gateway, an unavailable service, a timeout. */
const UNAVAILABLE_STATUSES = new Set([502, 503, 504]);

/**
 * Whether an error means a service can't answer right now (unreachable,
 * starting, or itself waiting on another), so trying again later may work.
 */
export function isUnavailable(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === SERVICE_UNAVAILABLE ||
      UNAVAILABLE_STATUSES.has(error.status))
  );
}

/** The message for a service that doesn't answer (`serviceNameFor`'s name, or null). */
export function unavailableMessage(service: string | null): string {
  return `${service ?? "A service"} can't be reached right now. It may still be starting: try again in a moment.`;
}

/**
 * A JSON call to an Aether-os API with the session's access token. A
 * service that doesn't answer (refused, timed out) or answers 502–504 is an
 * `ApiError` with status 503 and `SERVICE_UNAVAILABLE` (`isUnavailable`),
 * naming the service unless it said more itself.
 */
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
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    // Refused, reset or timed out: no answer at all.
    console.warn(`No answer from ${new URL(path, base).origin}`, error);
    throw new ApiError(
      503,
      SERVICE_UNAVAILABLE,
      unavailableMessage(serviceNameFor(base)),
    );
  }
  if (response.status === 401) {
    // The token is invalid or expired (e.g. Pistis's keys changed, or the
    // session was revoked): the session is no use any more, so sign out.
    redirect(`/auth/expired?token=${tokenFingerprint(token)}`);
  }
  if (response.status === 403) {
    // Refused: the token's roles may be older than the person's (a role
    // granted since). Once per token, while a page loads, get one with the
    // current roles and load it again; a second refusal is shown.
    const target = await forbiddenRefresh(token);
    if (target) redirect(target);
  }
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as {
      code?: string;
      detail?: string;
    };
    if (UNAVAILABLE_STATUSES.has(response.status)) {
      // Its own words when it gave some (e.g. "Polis can't be reached").
      throw new ApiError(
        503,
        problem.code ?? SERVICE_UNAVAILABLE,
        problem.detail ?? unavailableMessage(serviceNameFor(base)),
      );
    }
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

/** Where a refused page goes for a fresh token, or null (`refreshAfterForbidden`). */
async function forbiddenRefresh(token: string): Promise<string | null> {
  try {
    const request = await headers();
    const accept = request.get("accept") ?? "";
    return refreshAfterForbidden(await currentSession(), token, {
      serverAction: request.has("next-action"),
      // A document, or a client navigation's React Server Components.
      page: request.get("rsc") === "1" || accept.includes("text/html"),
      path: request.get(PATH_HEADER),
    });
  } catch (error) {
    unstable_rethrow(error);
    // Outside a request (nothing to reload): show the refusal.
    return null;
  }
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
    // Unreachable (a fetch error or timeout, `isUnavailable`), 503 (not
    // configured, GitHub down) or another 5xx.
    return { items: [], unavailable: true };
  }
}
