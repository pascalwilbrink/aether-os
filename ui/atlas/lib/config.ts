/**
 * Atlas's server-side configuration, from the environment (`.env.local`
 * locally; see `.env.example`). Only imported on the server: none of these
 * reach the browser (no `NEXT_PUBLIC_` prefix). Read when used (at request
 * time), not at build time, so a build needs no secrets.
 */
const production = () => process.env.NODE_ENV === "production";

function value(name: string, fallback: string): string {
  const configured = process.env[name];
  if (configured) {
    return configured;
  }
  if (!production()) {
    return fallback;
  }
  throw new Error(`${name} is not set (see .env.example)`);
}

export const config = {
  /** Pistis's issuer; Atlas signs people in there. */
  get pistisIssuer() {
    return value("PISTIS_ISSUER", "http://localhost:3003/oidc");
  },
  /** Atlas's client at Pistis: public, code flow with PKCE. */
  get clientId() {
    return value("ATLAS_CLIENT_ID", "atlas");
  },
  /** Where Atlas is reachable; the redirect URIs are built from it. */
  get url() {
    return value("ATLAS_URL", "http://localhost:3012");
  },
  /**
   * Encrypts the session cookie (at least 32 characters). Outside
   * production a fixed development value is used.
   */
  get sessionSecret() {
    const secret = value(
      "ATLAS_SESSION_SECRET",
      "development-only-atlas-session-secret-not-for-production",
    );
    if (secret.length < 32) {
      throw new Error("ATLAS_SESSION_SECRET must be at least 32 characters");
    }
    return secret;
  },
  /** Pistis's API: the issuer's origin unless set. */
  get pistisUrl() {
    return process.env.PISTIS_URL || new URL(this.pistisIssuer).origin;
  },
  /** Organizations, departments, teams, persons, memberships. */
  get polisUrl() {
    return value("POLIS_URL", "http://localhost:3001");
  },
  get secureCookies() {
    return production();
  },
};
