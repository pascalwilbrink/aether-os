import { Inject, Injectable } from '@nestjs/common';
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  jwtVerify,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from 'jose';

import type { AuthOptions } from './auth.options.js';
import { AUTH_OPTIONS } from './auth.options.js';
import {
  principalFromClaims,
  zAccessTokenClaims,
  type Principal,
} from './principal.js';

/** Pistis's signing algorithms. */
const ALGORITHMS = ['ES256', 'ES384', 'RS256', 'PS256', 'EdDSA'];

/**
 * Verifies Pistis access tokens locally (docs/identity.md): signature
 * against Pistis's JWKS (fetched once and cached; refetched for an unknown
 * `kid`, so key rotation needs no restart), `iss`, `aud`, expiry, the
 * `at+jwt` type, and the Aether-os claims.
 */
@Injectable()
export class TokenVerifier {
  private readonly keys: JWTVerifyGetKey;

  constructor(@Inject(AUTH_OPTIONS) private readonly options: AuthOptions) {
    this.keys = options.jwks
      ? createLocalJWKSet(options.jwks as JSONWebKeySet)
      : createRemoteJWKSet(
          new URL(
            options.jwksUri ?? `${options.issuer.replace(/\/$/, '')}/jwks`,
          ),
          {
            timeoutDuration: 5000,
            cooldownDuration: 30_000,
          },
        );
  }

  /** The principal of a valid token; throws for anything else. */
  async verify(token: string): Promise<Principal> {
    const { payload } = await jwtVerify(token, this.keys, {
      issuer: this.options.issuer,
      audience: this.options.audience ?? 'aether-os',
      algorithms: ALGORITHMS,
      typ: 'at+jwt',
      clockTolerance: 5,
      requiredClaims: ['exp', 'iat', 'sub'],
    });
    return principalFromClaims(zAccessTokenClaims.parse(payload));
  }
}
