import "server-only";

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
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(new URL(path, base), {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
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
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
