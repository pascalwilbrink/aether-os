import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isAdmin } from "../admin";
import { config } from "../config";
import { organizationRoles } from "./claims";
import { openSession, SESSION_COOKIE, type Session } from "./session";

/**
 * The current session, read from the encrypted cookie (refreshed by
 * `proxy.ts` before the page renders), or null. Reads the request, so call
 * it inside a `<Suspense>` boundary.
 */
export async function currentSession(): Promise<Session | null> {
  return openSession(
    (await cookies()).get(SESSION_COOKIE)?.value,
    config.sessionSecret,
  );
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
 * The session, with a token for `organizationId` in which the person is an
 * owner or admin. A token for another organization (or none) means
 * switching, through Pistis; anyone else goes back to choosing one. Every
 * page and Server Function of an organization calls it: a layout doesn't
 * guard its pages.
 */
export async function requireAdmin(
  organizationId: string,
  returnTo: string,
): Promise<Session> {
  const session = await requireSession(returnTo);
  if (session.organizationId !== organizationId) {
    redirect(
      `/auth/sign-in?organization=${encodeURIComponent(organizationId)}&returnTo=${encodeURIComponent(returnTo)}`,
    );
  }
  if (!isAdmin(organizationRoles(session.accessToken))) {
    redirect("/orgs?error=not-admin");
  }
  return session;
}
