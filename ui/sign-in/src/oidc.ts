import * as client from "openid-client";

import { randomToken } from "./seal.js";
import type { PendingSignIn, Session } from "./session.js";
import type { SignInSettings } from "./settings.js";

/** The platform resource and an organization's (Pistis's resources.ts). */
export const PLATFORM_RESOURCE = "urn:aether-os";
export const organizationResource = (organizationId: string) =>
  `${PLATFORM_RESOURCE}:org:${organizationId}`;

const SCOPE = "openid profile email api offline_access";
const NO_REFRESH_TOKEN = "No refresh token";

/**
 * Whether Pistis refused (an OAuth error: an invalid or revoked refresh
 * token, a membership gone, no refresh token at all), as opposed to not
 * answering or failing on its side. A refusal means the session is over;
 * anything else may pass once Pistis is up.
 */
export function isRefusal(error: unknown): boolean {
  return (
    (error instanceof client.ResponseBodyError && error.status < 500) ||
    error instanceof client.AuthorizationResponseError ||
    error instanceof client.WWWAuthenticateChallengeError ||
    (error instanceof Error && error.message === NO_REFRESH_TOKEN)
  );
}

/** Pistis's metadata per issuer and client, discovered once (and again after a failure). */
const discovered = new Map<string, Promise<client.Configuration>>();

/**
 * An app's OAuth client at Pistis (public, code flow with PKCE): starting
 * and finishing a sign-in, refreshing, signing out.
 */
export function pistisClient(settings: () => SignInSettings) {
  function pistis(): Promise<client.Configuration> {
    const { issuer, clientId } = settings();
    const key = `${issuer} ${clientId}`;
    let found = discovered.get(key);
    if (!found) {
      found = client
        .discovery(new URL(issuer), clientId, undefined, client.None(), {
          // http only outside production (local Pistis).
          execute: issuer.startsWith("http:")
            ? [client.allowInsecureRequests]
            : [],
        })
        .catch((error: unknown) => {
          discovered.delete(key);
          throw error;
        });
      discovered.set(key, found);
    }
    return found;
  }

  const callbackUrl = () =>
    new URL("/auth/callback", settings().appUrl).href;

  /**
   * Starts a sign-in (or an organization switch): Pistis's authorization URL
   * and what the callback needs to finish it. With a Pistis session already
   * there, Pistis answers without showing a page.
   */
  async function startSignIn(
    organizationId: string | null,
    returnTo: string,
  ): Promise<{ url: URL; pending: PendingSignIn }> {
    const codeVerifier = client.randomPKCECodeVerifier();
    const pending: PendingSignIn = {
      state: randomToken(),
      nonce: randomToken(),
      codeVerifier,
      organizationId,
      returnTo,
    };
    const url = client.buildAuthorizationUrl(await pistis(), {
      redirect_uri: callbackUrl(),
      scope: SCOPE,
      // Refresh tokens need consent; Pistis grants it without a page.
      prompt: "consent",
      resource: organizationId
        ? organizationResource(organizationId)
        : PLATFORM_RESOURCE,
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: "S256",
    });
    return { url, pending };
  }

  /** Finishes a sign-in from the callback URL: the new session. */
  async function finishSignIn(
    currentUrl: URL,
    pending: PendingSignIn,
  ): Promise<Session> {
    const tokens = await client.authorizationCodeGrant(
      await pistis(),
      currentUrl,
      {
        pkceCodeVerifier: pending.codeVerifier,
        expectedState: pending.state,
        expectedNonce: pending.nonce,
        idTokenExpected: true,
      },
    );
    const claims = tokens.claims();
    if (!claims) {
      throw new Error("Pistis returned no ID token");
    }
    return {
      sub: claims.sub,
      name: typeof claims.name === "string" ? claims.name : claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      organizationId: pending.organizationId,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: Date.now() + (tokens.expiresIn() ?? 300) * 1000,
      refreshToken: tokens.refresh_token ?? null,
      idToken: tokens.id_token ?? null,
    };
  }

  /**
   * A new access token for the same organization (refresh tokens rotate:
   * the old one is spent). Pistis checks the membership again, so a revoked
   * one fails here.
   */
  async function refreshSession(session: Session): Promise<Session> {
    if (!session.refreshToken) {
      throw new Error(NO_REFRESH_TOKEN);
    }
    const tokens = await client.refreshTokenGrant(
      await pistis(),
      session.refreshToken,
      {
        resource: session.organizationId
          ? organizationResource(session.organizationId)
          : PLATFORM_RESOURCE,
      },
    );
    return {
      ...session,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: Date.now() + (tokens.expiresIn() ?? 300) * 1000,
      refreshToken: tokens.refresh_token ?? session.refreshToken,
      idToken: tokens.id_token ?? session.idToken,
    };
  }

  /** Pistis's logout URL, back to the app's home page afterwards. */
  async function signOutUrl(idToken: string | null): Promise<URL> {
    return client.buildEndSessionUrl(await pistis(), {
      post_logout_redirect_uri: new URL("/", settings().appUrl).href,
      client_id: settings().clientId,
      ...(idToken ? { id_token_hint: idToken } : {}),
    });
  }

  return { callbackUrl, startSignIn, finishSignIn, refreshSession, signOutUrl };
}
