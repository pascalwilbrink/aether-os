import { createHash } from "node:crypto";

import { seal, unseal } from "./seal";

/**
 * A signed-in person's session, kept server-side only in an encrypted,
 * `httpOnly` cookie: the browser never sees a token. One organization at a
 * time (docs/identity.md: one organization per token); choosing another is
 * a new authorization request.
 */
export interface Session {
  /** Pistis's `sub` for the user. */
  sub: string;
  name: string;
  email: string | null;
  /** The organization the access token is for; null for a platform token. */
  organizationId: string | null;
  accessToken: string;
  /** Epoch milliseconds. */
  accessTokenExpiresAt: number;
  refreshToken: string | null;
  /** For RP-initiated logout at Pistis. */
  idToken: string | null;
  /**
   * The fingerprint of the access token Iris refreshed because a page was
   * refused (403): that token has the person's current roles, so a 403 with
   * it is shown, not refreshed again (`refreshAfterForbidden`).
   */
  refreshedForForbidden?: string;
}

/** The pending sign-in, between the redirect to Pistis and the callback. */
export interface PendingSignIn {
  state: string;
  nonce: string;
  codeVerifier: string;
  organizationId: string | null;
  returnTo: string;
}

export const SESSION_COOKIE = "iris_session";
export const SIGN_IN_COOKIE = "iris_sign_in";
/** As long as Pistis's refresh tokens (14 days). */
export const SESSION_MAX_AGE = 14 * 24 * 60 * 60;
export const SIGN_IN_MAX_AGE = 10 * 60;
/** Refresh when the access token has less than this left. */
export const REFRESH_MARGIN_MS = 60_000;

export const cookieOptions = (secure: boolean, maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure,
  path: "/",
  maxAge,
});

export const sealSession = (session: Session, secret: string) =>
  seal({ ...session }, secret, SESSION_MAX_AGE);

export const openSession = (sealed: string | undefined, secret: string) =>
  unseal<Session>(sealed, secret);

export const sealPendingSignIn = (pending: PendingSignIn, secret: string) =>
  seal({ ...pending }, secret, SIGN_IN_MAX_AGE);

export const openPendingSignIn = (sealed: string | undefined, secret: string) =>
  unseal<PendingSignIn>(sealed, secret);

/** Whether the access token should be refreshed before use. */
export function needsRefresh(session: Session, now = Date.now()): boolean {
  return session.accessTokenExpiresAt - now < REFRESH_MARGIN_MS;
}

/**
 * A short fingerprint of an access token, so a link can name the token an
 * API refused without carrying the token itself (`/auth/expired`).
 */
export function tokenFingerprint(accessToken: string): string {
  return createHash("sha256")
    .update(accessToken)
    .digest("base64url")
    .slice(0, 22);
}

/** Only same-site paths, so `returnTo` can't send people elsewhere. */
export function safeReturnTo(value: string | null | undefined): string {
  return value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/\\")
    ? value
    : "/";
}

/** Where a page refused with a 403 goes for a token with current roles. */
export const FORBIDDEN_REFRESH_PATH = "/auth/refresh";

/** The page's path, set by `proxy.ts` for the server to read. */
export const PATH_HEADER = "x-iris-path";

/**
 * Where to send a page whose call a service refused (403), or null to show
 * the refusal: once per token, with the person's current roles from Pistis
 * (they may have been granted one since the token was issued). Only while a
 * page loads: a Server Action's refusal is its form's message.
 */
export function refreshAfterForbidden(
  session: Pick<Session, "accessToken" | "refreshedForForbidden"> | null,
  token: string,
  request: { serverAction: boolean; page: boolean; path: string | null },
): string | null {
  if (!session || session.accessToken !== token) return null;
  if (request.serverAction || !request.page || !request.path) return null;
  const fingerprint = tokenFingerprint(token);
  if (session.refreshedForForbidden === fingerprint) return null;
  const query = new URLSearchParams({
    token: fingerprint,
    returnTo: safeReturnTo(request.path),
  });
  return `${FORBIDDEN_REFRESH_PATH}?${query}`;
}
