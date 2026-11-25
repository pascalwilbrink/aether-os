import "server-only";

import { createSignIn } from "@aether-os/sign-in";

import { config } from "../config";

/**
 * Iris's sign-in through Pistis (`@aether-os/sign-in`, `../../../sign-in`):
 * the session in the `iris_session` cookie, the `/auth/` routes and the
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
  { cookiePrefix: "iris" },
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
 * The session, with a token for `organizationId`: a token for another
 * organization (or none) means switching, through Pistis.
 */
export const requireOrganization = (organizationId: string, returnTo: string) =>
  signIn.requireOrganization(organizationId, returnTo);
