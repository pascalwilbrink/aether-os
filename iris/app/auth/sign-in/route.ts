import { NextResponse, type NextRequest } from "next/server";

import { config } from "@/lib/config";
import { startSignIn } from "@/lib/auth/oidc";
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
  const organizationId = organization && UUID.test(organization) ? organization : null;
  const returnTo = safeReturnTo(
    request.nextUrl.searchParams.get("returnTo") ??
      (organizationId ? `/orgs/${organizationId}` : "/"),
  );

  const { url, pending } = await startSignIn(organizationId, returnTo);
  const response = NextResponse.redirect(url);
  response.cookies.set(
    SIGN_IN_COOKIE,
    await sealPendingSignIn(pending, config.sessionSecret),
    cookieOptions(config.secureCookies, SIGN_IN_MAX_AGE),
  );
  return response;
}
