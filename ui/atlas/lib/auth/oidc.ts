import * as client from "openid-client";

import { config } from "../config";
import { randomToken } from "./seal";
import type { PendingSignIn, Session } from "./session";

/** The platform resource and an organization's (Pistis's resources.ts). */
export const PLATFORM_RESOURCE = "urn:aether-os";
export const organizationResource = (organizationId: string) =>
  `${PLATFORM_RESOURCE}:org:${organizationId}`;

const SCOPE = "openid profile email api offline_access";

let discovered: Promise<client.Configuration> | undefined;

/** Pistis's metadata, discovered once (and again after a failure). */
function pistis(): Promise<client.Configuration> {
  discovered ??= client
    .discovery(
      new URL(config.pistisIssuer),
      config.clientId,
      undefined,
      client.None(),
      {
        // http only outside production (local Pistis).
        execute: config.pistisIssuer.startsWith("http:")
          ? [client.allowInsecureRequests]
          : [],
      },
    )
    .catch((error: unknown) => {
      discovered = undefined;
      throw error;
    });
  return discovered;
}

/**
 * Whether Pistis refused (an OAuth error: an invalid or revoked refresh
 * token, a membership gone, no refresh token at all), as opposed to not
 * answering or failing on its side. A refusal means the session is over;
 * anything else may pass once Pistis is up (see `pistisRunning`).
 */
export function isRefusal(error: unknown): boolean {
  return (
    (error instanceof client.ResponseBodyError && error.status < 500) ||
    error instanceof client.AuthorizationResponseError ||
    error instanceof client.WWWAuthenticateChallengeError ||
    (error instanceof Error && error.message === NO_REFRESH_TOKEN)
  );
}

const NO_REFRESH_TOKEN = "No refresh token";

export const callbackUrl = () => new URL("/auth/callback", config.url).href;

/**
 * Starts a sign-in (or an organization switch): Pistis's authorization URL
 * and what the callback needs to finish it. With a Pistis session already
 * there, Pistis answers without showing a page.
 */
export async function startSignIn(
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
export async function finishSignIn(
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
export async function refreshSession(session: Session): Promise<Session> {
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

/** Pistis's logout URL, back to Atlas's home page afterwards. */
export async function signOutUrl(idToken: string | null): Promise<URL> {
  return client.buildEndSessionUrl(await pistis(), {
    post_logout_redirect_uri: new URL("/", config.url).href,
    client_id: config.clientId,
    ...(idToken ? { id_token_hint: idToken } : {}),
  });
}
