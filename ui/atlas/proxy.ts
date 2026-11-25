import { NextResponse, type NextRequest } from "next/server";

import { isRefusal, refreshSession } from "@/lib/auth/oidc";
import {
  cookieOptions,
  needsRefresh,
  openSession,
  sealSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth/session";
import { config as atlas } from "@/lib/config";
import { isRunning } from "@/lib/health";

/**
 * Keeps the access token fresh before pages render: Server Components
 * can't set cookies, and Pistis rotates refresh tokens, so the new tokens
 * must be stored here. The refreshed cookie goes to this request (so the
 * page sees it) and to the browser. If refreshing fails (expired, revoked,
 * no longer a member) the session is dropped and the page sends people to
 * sign in; if Pistis just doesn't answer, the session is kept while its
 * access token still works.
 */
export async function proxy(request: NextRequest) {
  const sealed = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sealed) {
    return NextResponse.next();
  }
  const session = await openSession(sealed, atlas.sessionSecret);
  if (session && !needsRefresh(session)) {
    return NextResponse.next();
  }

  let value: string | null = null;
  if (session?.refreshToken) {
    try {
      value = await sealSession(
        await refreshSession(session),
        atlas.sessionSecret,
      );
    } catch (error) {
      console.warn("Refreshing the session failed", error);
      if (
        !isRefusal(error) &&
        session.accessTokenExpiresAt > Date.now() &&
        !(await isRunning(atlas.pistisUrl))
      ) {
        return NextResponse.next();
      }
    }
  }

  if (value) {
    request.cookies.set(SESSION_COOKIE, value);
  } else {
    request.cookies.delete(SESSION_COOKIE);
  }
  const response = NextResponse.next({ request: { headers: request.headers } });
  if (value) {
    response.cookies.set(
      SESSION_COOKIE,
      value,
      cookieOptions(atlas.secureCookies, SESSION_MAX_AGE),
    );
  } else {
    response.cookies.delete(SESSION_COOKIE);
  }
  return response;
}

export const config = {
  // Pages only: not Next's assets, nor the sign-in routes (which manage the
  // cookie themselves), nor `/health`.
  matcher: ["/((?!_next/|auth/|health|favicon.ico).*)"],
};
