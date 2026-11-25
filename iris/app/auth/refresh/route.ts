import { NextResponse, type NextRequest } from "next/server";

import { isRefusal, refreshSession } from "@/lib/auth/oidc";
import {
  cookieOptions,
  openSession,
  safeReturnTo,
  sealSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  tokenFingerprint,
} from "@/lib/auth/session";
import { config } from "@/lib/config";

/**
 * Where a page goes when a service refused it (403) with a token that may
 * be older than the person's roles (`lib/api/http.ts`): a new token from
 * Pistis, which reads the roles from Polis again, marked so that a refusal
 * with it is shown instead of refreshed again; then back to the page.
 * `?token=` is the refused token's fingerprint: only a session holding it
 * is refreshed, so a link from elsewhere can't do it.
 */
export async function GET(request: NextRequest) {
  const back = new URL(
    safeReturnTo(request.nextUrl.searchParams.get("returnTo")),
    config.url,
  );
  const session = await openSession(
    request.cookies.get(SESSION_COOKIE)?.value,
    config.sessionSecret,
  );
  const refused = request.nextUrl.searchParams.get("token");
  if (!session || !refused || tokenFingerprint(session.accessToken) !== refused) {
    return NextResponse.redirect(back, 303);
  }

  let next = session;
  try {
    next = await refreshSession(session);
  } catch (error) {
    if (isRefusal(error)) {
      // Not a member any more (or the refresh token is spent): sign out.
      const home = new URL("/", config.url);
      home.searchParams.set("error", "Your session expired. Sign in again.");
      const response = NextResponse.redirect(home, 303);
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    // Pistis didn't answer: keep the token, and show the refusal this time.
    console.warn("Refreshing the session after a 403 failed", error);
  }
  next = { ...next, refreshedForForbidden: tokenFingerprint(next.accessToken) };
  const response = NextResponse.redirect(back, 303);
  response.cookies.set(
    SESSION_COOKIE,
    await sealSession(next, config.sessionSecret),
    cookieOptions(config.secureCookies, SESSION_MAX_AGE),
  );
  return response;
}
