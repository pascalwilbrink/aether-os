import { NextResponse, type NextRequest } from "next/server";

import { config } from "@/lib/config";
import { callbackUrl, finishSignIn } from "@/lib/auth/oidc";
import {
  cookieOptions,
  openPendingSignIn,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sealSession,
  SIGN_IN_COOKIE,
} from "@/lib/auth/session";

/**
 * Pistis sends people back here with a code (or an error, e.g.
 * `access_denied` for an organization they aren't a member of). The pending
 * sign-in cookie proves this browser started it.
 */
export async function GET(request: NextRequest) {
  const pending = await openPendingSignIn(
    request.cookies.get(SIGN_IN_COOKIE)?.value,
    config.sessionSecret,
  );
  const home = (path: string) => {
    const response = NextResponse.redirect(new URL(path, config.url));
    response.cookies.delete(SIGN_IN_COOKIE);
    return response;
  };
  if (!pending) {
    return home("/?error=expired");
  }

  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    // An organization the person can't enter: back to choosing one.
    return home(
      pending.organizationId
        ? `/orgs?error=${encodeURIComponent(error)}`
        : `/?error=${encodeURIComponent(error)}`,
    );
  }

  // openid-client checks the redirect URI against the URL Pistis called.
  const current = new URL(callbackUrl());
  current.search = request.nextUrl.search;
  try {
    const session = await finishSignIn(current, pending);
    const response = home(pending.returnTo);
    response.cookies.set(
      SESSION_COOKIE,
      await sealSession(session, config.sessionSecret),
      cookieOptions(config.secureCookies, SESSION_MAX_AGE),
    );
    return response;
  } catch (failure) {
    console.error("Sign-in failed", failure);
    return home("/?error=sign-in-failed");
  }
}
