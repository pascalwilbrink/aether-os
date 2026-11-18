import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { config } from "../config";
import { openSession, SESSION_COOKIE, type Session } from "./session";

/**
 * The current session, read from the encrypted cookie (refreshed by
 * `proxy.ts` before the page renders), or null. Reads the request, so call
 * it inside a `<Suspense>` boundary.
 */
export async function currentSession(): Promise<Session | null> {
  return openSession((await cookies()).get(SESSION_COOKIE)?.value, config.sessionSecret);
}

/** The current session, or off to sign in (coming back to `returnTo`). */
export async function requireSession(returnTo = "/"): Promise<Session> {
  const session = await currentSession();
  if (!session) {
    redirect(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return session;
}

/**
 * The session, with a token for `organizationId`: a token for another
 * organization (or none) means switching, through Pistis.
 */
export async function requireOrganization(organizationId: string, returnTo: string): Promise<Session> {
  const session = await requireSession(returnTo);
  if (session.organizationId !== organizationId) {
    redirect(
      `/auth/sign-in?organization=${encodeURIComponent(organizationId)}&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }
  return session;
}
