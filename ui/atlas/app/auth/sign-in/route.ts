import { NextResponse, type NextRequest } from "next/server";

import { config } from "@/lib/config";
import { startSignIn } from "@/lib/auth/oidc";
import { isRunning } from "@/lib/health";
import {
  cookieOptions,
  safeReturnTo,
  sealPendingSignIn,
  SIGN_IN_COOKIE,
  SIGN_IN_MAX_AGE,
} from "@/lib/auth/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Off to Pistis: `?organization=<id>` asks for a token for that
 * organization (also how people switch), without it a platform token;
 * `?returnTo=/path` is where to land afterwards.
 */
export async function GET(request: NextRequest) {
  const organization = request.nextUrl.searchParams.get("organization");
  const organizationId =
    organization && UUID.test(organization) ? organization : null;
  const returnTo = safeReturnTo(
    request.nextUrl.searchParams.get("returnTo") ??
      (organizationId ? `/orgs/${organizationId}` : "/"),
  );

  let started: Awaited<ReturnType<typeof startSignIn>>;
  try {
    started = await startSignIn(organizationId, returnTo);
  } catch (error) {
    // Pistis's metadata couldn't be read: usually Pistis isn't up yet.
    console.error("Starting a sign-in failed", error);
    const reason = (await isRunning(config.pistisUrl))
      ? "sign-in-failed"
      : "pistis-unavailable";
    return NextResponse.redirect(new URL(`/?error=${reason}`, config.url));
  }
  const { url, pending } = started;
  const response = NextResponse.redirect(url);
  response.cookies.set(
    SIGN_IN_COOKIE,
    await sealPendingSignIn(pending, config.sessionSecret),
    cookieOptions(config.secureCookies, SIGN_IN_MAX_AGE),
  );
  return response;
}
