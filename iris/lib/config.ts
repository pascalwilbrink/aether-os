/**
 * Iris's server-side configuration, from the environment (`.env.local`
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
  /** Pistis's issuer; Iris signs people in there. */
  get pistisIssuer() {
    return value("PISTIS_ISSUER", "http://localhost:3003/oidc");
  },
  /** Iris's client at Pistis: public, code flow with PKCE. */
  get clientId() {
    return value("IRIS_CLIENT_ID", "iris");
  },
  /** Where Iris is reachable; the redirect URIs are built from it. */
  get url() {
    return value("IRIS_URL", "http://localhost:3000");
  },
  /**
   * Encrypts the session cookie (at least 32 characters). Outside
   * production a fixed development value is used.
   */
  get sessionSecret() {
    const secret = value(
      "IRIS_SESSION_SECRET",
      "development-only-iris-session-secret-not-for-production",
    );
    if (secret.length < 32) {
      throw new Error("IRIS_SESSION_SECRET must be at least 32 characters");
    }
    return secret;
  },
  /** Pistis's API: the issuer's origin unless set. */
  get pistisUrl() {
    return process.env.PISTIS_URL || new URL(this.pistisIssuer).origin;
  },
  get polisUrl() {
    return value("POLIS_URL", "http://localhost:3001");
  },
  get hephaestusUrl() {
    return value("HEPHAESTUS_URL", "http://localhost:3002");
  },
  /** Agents and their versions. */
  get agoraUrl() {
    return value("AGORA_URL", "http://localhost:3008");
  },
  /** The model gateway: the model catalogue, provider keys and budgets. */
  get pylonUrl() {
    return value("PYLON_URL", "http://localhost:3011");
  },
  /** Connections to external systems: the GitHub App, its repositories, project links. */
  get proxenosUrl() {
    return value("PROXENOS_URL", "http://localhost:3004");
  },
  /** Automations: triggers bound to agents. */
  get kairosUrl() {
    return value("KAIROS_URL", "http://localhost:3005");
  },
  /** Notifications: each user's inbox. */
  get kerykesUrl() {
    return value("KERYKES_URL", "http://localhost:3006");
  },
  /** Files: downloads of file artifacts (signed URLs). */
  get loculusUrl() {
    return value("LOCULUS_URL", "http://localhost:3007");
  },
  /**
   * Where people browse traces (optional; no links without them): Jaeger's
   * UI, and Langfuse's with the project the Collector sends to.
   */
  get traceViewers() {
    return {
      jaegerUrl: process.env.JAEGER_URL || null,
      langfuseUrl: process.env.LANGFUSE_URL || null,
      langfuseProjectId: process.env.LANGFUSE_PROJECT_ID || null,
    };
  },
  get secureCookies() {
    return production();
  },
};
