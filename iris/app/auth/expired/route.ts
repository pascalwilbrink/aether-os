import { NextResponse, type NextRequest } from "next/server";

import { config } from "@/lib/config";
import {
  openSession,
  SESSION_COOKIE,
  tokenFingerprint,
} from "@/lib/auth/session";

const MESSAGE = "Your session expired. Sign in again.";

/**
 * Where Iris goes when an API refuses the session's token (401, "The token
 * is invalid or expired"): signs out of Iris and lands on the home page.
 * `?token=` is the refused token's fingerprint, and only a session holding
 * that token is dropped, so a link from elsewhere can't sign people out.
 */
export async function GET(request: NextRequest) {
  const session = await openSession(
    request.cookies.get(SESSION_COOKIE)?.value,
    config.sessionSecret,
  );
  const refused = request.nextUrl.searchParams.get("token");
  const expired =
    session !== null &&
    refused !== null &&
    tokenFingerprint(session.accessToken) === refused;

  const home = new URL("/", config.url);
  if (expired) home.searchParams.set("error", MESSAGE);
  const response = NextResponse.redirect(home, 303);
  if (expired) response.cookies.delete(SESSION_COOKIE);
  return response;
}
