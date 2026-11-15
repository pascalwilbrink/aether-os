import { NextResponse, type NextRequest } from "next/server";

import { config } from "@/lib/config";
import { signOutUrl } from "@/lib/auth/oidc";
import { openSession, SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Signs out of Iris and of Pistis (RP-initiated logout), back to the home
 * page. A POST from Iris's own form: the `lax` session cookie isn't sent on
 * another site's POST, so nobody can sign people out from elsewhere.
 */
export async function POST(request: NextRequest) {
  const session = await openSession(
    request.cookies.get(SESSION_COOKIE)?.value,
    config.sessionSecret,
  );
  const response = NextResponse.redirect(await signOutUrl(session?.idToken ?? null), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
