export const AUTH_OPTIONS = Symbol('AUTH_OPTIONS');

export interface AuthOptions {
  /** Pistis's issuer (`iss`), e.g. `http://localhost:3003/oidc`. */
  issuer: string;
  /** Defaults to `aether-os`. */
  audience?: string;
  /** Defaults to `<issuer>/jwks`. */
  jwksUri?: string;
  /** Public keys to trust instead of fetching them (tests: `TestTokens.jwks`). */
  jwks?: { keys: Record<string, unknown>[] };
}
