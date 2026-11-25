import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";

import { HEALTH_TIMEOUT_MS, isRunning } from "./health.js";
import { isRefusal, pistisClient } from "./oidc.js";
import {
  cookieNames,
  cookieOptions,
  needsRefresh,
  openPendingSignIn,
  openSession,
  safeReturnTo,
  sealPendingSignIn,
  sealSession,
  SESSION_MAX_AGE,
  SIGN_IN_MAX_AGE,
  tokenFingerprint,
  type Session,
} from "./session.js";
import type { SignInSettings } from "./settings.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EXPIRED = "Your session expired. Sign in again.";

export interface SignInOptions {
  /** The app's cookies are `<cookiePrefix>_session` and `<cookiePrefix>_sign_in`. */
  cookiePrefix: string;
}

export interface ProxyOptions {
  /**
   * A request header to put the page's path (and query) in, for the server
   * to read (`refreshAfterForbidden`). Never what the browser sent under
   * that name.
   */
  pathHeader?: string;
  /**
   * Where to show the page when Pistis doesn't answer and the access token
   * has expired (a page that waits for the services and reloads). Without
   * one, the session is dropped then, as for a refusal.
   */
  unavailablePath?: string;
}

/**
 * An app's sign-in through Pistis, as a backend for frontend: the browser
 * never holds a token. The session lives in an encrypted, `httpOnly`
 * cookie; the app mounts the routes under `/auth/` and calls `proxy` from
 * its `proxy.ts` to keep the access token fresh.
 */
export function createSignIn(
  settings: () => SignInSettings,
  { cookiePrefix }: SignInOptions,
) {
  const names = cookieNames(cookiePrefix);
  const pistis = pistisClient(settings);
  const secret = () => {
    const value = settings().sessionSecret;
    if (value.length < 32) {
      throw new Error("The session secret must be at least 32 characters");
    }
    return value;
  };
  const sessionCookie = (value: string) =>
    [
      names.session,
      value,
      cookieOptions(settings().secureCookies, SESSION_MAX_AGE),
    ] as const;
  const home = (path: string) => new URL(path, settings().appUrl);

  /**
   * The current session, read from the encrypted cookie (refreshed by the
   * proxy before the page renders), or null. Reads the request, so call it
   * inside a `<Suspense>` boundary.
   */
  async function currentSession(): Promise<Session | null> {
    return openSession((await cookies()).get(names.session)?.value, secret());
  }

  /** The current session, or off to sign in (coming back to `returnTo`). */
  async function requireSession(returnTo = "/"): Promise<Session> {
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
  async function requireOrganization(
    organizationId: string,
    returnTo: string,
  ): Promise<Session> {
    const session = await requireSession(returnTo);
    if (session.organizationId !== organizationId) {
      redirect(
        `/auth/sign-in?organization=${encodeURIComponent(organizationId)}&returnTo=${encodeURIComponent(returnTo)}`,
      );
    }
    return session;
  }

  /**
   * `GET /auth/sign-in`: off to Pistis. `?organization=<id>` asks for a
   * token for that organization (also how people switch), without it a
   * platform token; `?returnTo=/path` is where to land afterwards.
   */
  async function signIn(request: NextRequest): Promise<Response> {
    const organization = request.nextUrl.searchParams.get("organization");
    const organizationId =
      organization && UUID.test(organization) ? organization : null;
    const returnTo = safeReturnTo(
      request.nextUrl.searchParams.get("returnTo") ??
        (organizationId ? `/orgs/${organizationId}` : "/"),
    );

    let started: Awaited<ReturnType<typeof pistis.startSignIn>>;
    try {
      started = await pistis.startSignIn(organizationId, returnTo);
    } catch (error) {
      // Pistis's metadata couldn't be read: usually Pistis isn't up yet.
      console.error("Starting a sign-in failed", error);
      const reason = (await isRunning(settings().pistisUrl))
        ? "sign-in-failed"
        : "pistis-unavailable";
      return NextResponse.redirect(home(`/?error=${reason}`));
    }
    const response = NextResponse.redirect(started.url);
    response.cookies.set(
      names.signIn,
      await sealPendingSignIn(started.pending, secret()),
      cookieOptions(settings().secureCookies, SIGN_IN_MAX_AGE),
    );
    return response;
  }

  /**
   * `GET /auth/callback`: Pistis sends people back here with a code (or an
   * error, e.g. `access_denied` for an organization they aren't a member
   * of). The pending sign-in cookie proves this browser started it.
   */
  async function callback(request: NextRequest): Promise<Response> {
    const pending = await openPendingSignIn(
      request.cookies.get(names.signIn)?.value,
      secret(),
    );
    const done = (path: string) => {
      const response = NextResponse.redirect(home(path));
      response.cookies.delete(names.signIn);
      return response;
    };
    if (!pending) {
      return done("/?error=expired");
    }

    const error = request.nextUrl.searchParams.get("error");
    if (error) {
      // An organization the person can't enter: back to choosing one.
      return done(
        pending.organizationId
          ? `/orgs?error=${encodeURIComponent(error)}`
          : `/?error=${encodeURIComponent(error)}`,
      );
    }

    // openid-client checks the redirect URI against the URL Pistis called.
    const current = new URL(pistis.callbackUrl());
    current.search = request.nextUrl.search;
    try {
      const session = await pistis.finishSignIn(current, pending);
      const response = done(pending.returnTo);
      response.cookies.set(...sessionCookie(await sealSession(session, secret())));
      return response;
    } catch (failure) {
      console.error("Sign-in failed", failure);
      return done(
        (await isRunning(settings().pistisUrl))
          ? "/?error=sign-in-failed"
          : "/?error=pistis-unavailable",
      );
    }
  }

  /**
   * `POST /auth/sign-out`: out of the app and of Pistis (RP-initiated
   * logout), back to the home page. A POST from the app's own form: the
   * `lax` session cookie isn't sent on another site's POST, so nobody can
   * sign people out from elsewhere.
   */
  async function signOut(request: NextRequest): Promise<Response> {
    const session = await openSession(
      request.cookies.get(names.session)?.value,
      secret(),
    );
    let target: URL;
    try {
      target = await pistis.signOutUrl(session?.idToken ?? null);
    } catch (error) {
      // Pistis doesn't answer: out of the app at least (Pistis's own
      // session stays until it expires or the next sign-out).
      console.error("Signing out at Pistis failed", error);
      target = home("/");
    }
    const response = NextResponse.redirect(target, 303);
    response.cookies.delete(names.session);
    return response;
  }

  /**
   * `GET /auth/expired?token=<fingerprint>`: where the app goes when an API
   * refuses the session's token (401): out of the app, to the home page.
   * Only a session holding that token is dropped, so a link from elsewhere
   * can't sign people out.
   */
  async function expired(request: NextRequest): Promise<Response> {
    const session = await openSession(
      request.cookies.get(names.session)?.value,
      secret(),
    );
    const refused = request.nextUrl.searchParams.get("token");
    const isExpired =
      session !== null &&
      refused !== null &&
      tokenFingerprint(session.accessToken) === refused;

    const target = home("/");
    if (isExpired) target.searchParams.set("error", EXPIRED);
    const response = NextResponse.redirect(target, 303);
    if (isExpired) response.cookies.delete(names.session);
    return response;
  }

  /**
   * `GET /auth/refresh?token=<fingerprint>&returnTo=<page>`: where a page
   * goes when a service refused it (403) with a token that may be older
   * than the person's roles (`refreshAfterForbidden`): a new token from
   * Pistis, marked so that a refusal with it is shown instead of refreshed
   * again; then back to the page. Only a session holding that token is
   * refreshed, so a link from elsewhere can't do it.
   */
  async function refresh(request: NextRequest): Promise<Response> {
    const back = home(safeReturnTo(request.nextUrl.searchParams.get("returnTo")));
    const session = await openSession(
      request.cookies.get(names.session)?.value,
      secret(),
    );
    const refused = request.nextUrl.searchParams.get("token");
    if (!session || !refused || tokenFingerprint(session.accessToken) !== refused) {
      return NextResponse.redirect(back, 303);
    }

    let next = session;
    try {
      next = await pistis.refreshSession(session);
    } catch (error) {
      if (isRefusal(error)) {
        // Not a member any more (or the refresh token is spent): sign out.
        const target = home("/");
        target.searchParams.set("error", EXPIRED);
        const response = NextResponse.redirect(target, 303);
        response.cookies.delete(names.session);
        return response;
      }
      // Pistis didn't answer: keep the token, and show the refusal this time.
      console.warn("Refreshing the session after a 403 failed", error);
    }
    next = { ...next, refreshedForForbidden: tokenFingerprint(next.accessToken) };
    const response = NextResponse.redirect(back, 303);
    response.cookies.set(...sessionCookie(await sealSession(next, secret())));
    return response;
  }

  /**
   * For the app's `proxy.ts`: keeps the access token fresh before pages
   * render. Server Components can't set cookies, and Pistis rotates
   * refresh tokens, so the new tokens are stored here: on this request (so
   * the page sees them) and in the browser. If refreshing fails (expired,
   * revoked, no longer a member) the session is dropped and pages send
   * people to sign in; if Pistis just doesn't answer, the session is kept
   * (`unavailablePath`).
   */
  async function proxy(
    request: NextRequest,
    { pathHeader, unavailablePath }: ProxyOptions = {},
  ): Promise<NextResponse> {
    if (pathHeader) {
      request.headers.set(
        pathHeader,
        request.nextUrl.pathname + request.nextUrl.search,
      );
    }
    const pass = () => NextResponse.next({ request: { headers: request.headers } });
    const sealed = request.cookies.get(names.session)?.value;
    if (!sealed) {
      return pass();
    }
    const session = await openSession(sealed, secret());
    if (session && !needsRefresh(session)) {
      return pass();
    }

    let value: string | null = null;
    if (session?.refreshToken) {
      try {
        value = await sealSession(await pistis.refreshSession(session), secret());
      } catch (error) {
        console.warn("Refreshing the session failed", error);
        // Pistis not answering (still starting, restarting) isn't the end
        // of the session: keep it. While its access token still works, the
        // page renders; once it's expired, the app's waiting page.
        if (
          !isRefusal(error) &&
          !(await isRunning(settings().pistisUrl, HEALTH_TIMEOUT_MS))
        ) {
          if (session.accessTokenExpiresAt > Date.now()) return pass();
          if (unavailablePath) {
            return NextResponse.rewrite(new URL(unavailablePath, request.url), {
              request: { headers: request.headers },
            });
          }
        }
      }
    }

    if (value) {
      request.cookies.set(names.session, value);
    } else {
      request.cookies.delete(names.session);
    }
    const response = pass();
    if (value) {
      response.cookies.set(...sessionCookie(value));
    } else {
      response.cookies.delete(names.session);
    }
    return response;
  }

  return {
    cookies: names,
    currentSession,
    requireSession,
    requireOrganization,
    refreshSession: pistis.refreshSession,
    routes: { signIn, callback, signOut, expired, refresh },
    proxy,
  };
}
