/**
 * What an app tells the sign-in code about itself, read when needed (at
 * request time, from the app's environment), never at build time.
 */
export interface SignInSettings {
  /** Pistis's issuer, e.g. `http://localhost:3003/oidc`. */
  issuer: string;
  /** The app's public client at Pistis (`iris`, `atlas`). */
  clientId: string;
  /** Where the app is reachable; the redirect URIs are built from it. */
  appUrl: string;
  /** Encrypts the session cookie (at least 32 characters). */
  sessionSecret: string;
  /** `Secure` cookies (production: HTTPS). */
  secureCookies: boolean;
  /** Pistis's API (its `/health/live`), to tell "Pistis is down" from a refusal. */
  pistisUrl: string;
}
