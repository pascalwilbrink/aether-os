import "server-only";

import { redirect } from "next/navigation";

import {
  createSignIn,
  organizationRoles,
  type Session,
} from "@aether-os/sign-in";

import { isAdmin } from "../admin";
import { config } from "../config";

/**
 * Atlas's sign-in through Pistis (`@aether-os/sign-in`, `../../../sign-in`):
 * the session in the `atlas_session` cookie, the `/auth/` routes and the
 * proxy. Configuration is read when used (`lib/config.ts`).
 */
export const signIn = createSignIn(
  () => ({
    issuer: config.pistisIssuer,
    clientId: config.clientId,
    appUrl: config.url,
    sessionSecret: config.sessionSecret,
    secureCookies: config.secureCookies,
    pistisUrl: config.pistisUrl,
  }),
  { cookiePrefix: "atlas" },
);

/**
 * The current session, or null. Reads the request, so call it inside a
 * `<Suspense>` boundary.
 */
export const currentSession = () => signIn.currentSession();

/** The current session, or off to sign in (coming back to `returnTo`). */
export const requireSession = (returnTo = "/") =>
  signIn.requireSession(returnTo);

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
  const session = await signIn.requireOrganization(organizationId, returnTo);
  if (!isAdmin(organizationRoles(session.accessToken))) {
    redirect("/orgs?error=not-admin");
  }
  return session;
}
