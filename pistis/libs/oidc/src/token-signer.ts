import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { importJWK, SignJWT, type JWK, type JWTPayload } from 'jose';

import { ServiceTokens, type Env } from '@pistis/core';

import { AUDIENCE } from './resources.js';
import { signingAlgorithm } from './signing-keys.js';

/** Pistis's private signing keys (a JWKS); the first signs. */
export const SIGNING_KEYS = Symbol('SIGNING_KEYS');
export type SigningKeys = { keys: JWK[] };

const PRIVATE_FIELDS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'];

/** The public half of the signing keys, for verifying Pistis's own tokens. */
export function publicKeys(keys: SigningKeys): {
  keys: Record<string, unknown>[];
} {
  return {
    keys: keys.keys.map((key) =>
      Object.fromEntries(
        Object.entries(key).filter(
          ([field]) => !PRIVATE_FIELDS.includes(field),
        ),
      ),
    ),
  };
}

/**
 * Signs access tokens outside oidc-provider, shaped like its own (`at+jwt`,
 * Pistis's issuer, `aud: aether-os`, the first signing key): Pistis's own
 * service token, and tokens in tests.
 */
@Injectable()
export class TokenSigner {
  private readonly issuer: string;

  constructor(
    @Inject(SIGNING_KEYS) private readonly keys: SigningKeys,
    config: ConfigService<Env, true>,
  ) {
    this.issuer = config.get('PISTIS_ISSUER', { infer: true });
  }

  async sign(
    claims: JWTPayload & { sub: string },
    expiresInSeconds: number,
  ): Promise<string> {
    const jwk = this.keys.keys[0];
    const alg = signingAlgorithm(this.keys);
    return new SignJWT(claims)
      .setProtectedHeader({ alg, kid: jwk.kid, typ: 'at+jwt' })
      .setIssuer(this.issuer)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setJti(crypto.randomUUID())
      .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
      .sign(await importJWK(jwk, alg));
  }
}

/** Pistis's own service token: `sub: pistis`, `platform:read`, for calls to Polis. */
@Injectable()
export class PistisServiceTokens extends ServiceTokens {
  private cached: { token: string; expiresAt: number } | undefined;

  constructor(private readonly signer: TokenSigner) {
    super();
  }

  async token(): Promise<string> {
    if (!this.cached || this.cached.expiresAt - 60_000 < Date.now()) {
      const ttl = 300;
      this.cached = {
        token: await this.signer.sign(
          { sub: 'pistis', sub_type: 'service', scope: 'platform:read' },
          ttl,
        ),
        expiresAt: Date.now() + ttl * 1000,
      };
    }
    return this.cached.token;
  }
}
