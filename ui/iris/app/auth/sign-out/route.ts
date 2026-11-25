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
  let target: URL;
  try {
    target = await signOutUrl(session?.idToken ?? null);
  } catch (error) {
    // Pistis doesn't answer: out of Iris at least (Pistis's own session
    // stays until it expires or the next sign-out).
    console.error("Signing out at Pistis failed", error);
    target = new URL("/", config.url);
  }
  const response = NextResponse.redirect(target, 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
