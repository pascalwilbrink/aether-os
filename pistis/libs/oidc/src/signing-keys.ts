import { exportJWK, generateKeyPair, type JWK } from 'jose';
import type { AsymmetricSigningAlgorithm } from 'oidc-provider';

/**
 * The private keys Pistis signs tokens with, as a JWKS. Configured keys
 * (`PISTIS_SIGNING_KEYS`) are used as given; without them (development and
 * tests only, the config refuses that in production) one ES256 key is
 * generated per start, so tokens don't outlive a restart.
 */
export async function signingKeys(
  configured: { keys: Record<string, unknown>[] } | undefined,
): Promise<{ keys: JWK[] }> {
  if (configured) {
    return configured as { keys: JWK[] };
  }
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });

  return {
    keys: [
      {
        ...(await exportJWK(privateKey)),
        kid: `dev-${Date.now().toString(36)}`,
        alg: 'ES256',
        use: 'sig',
      },
    ],
  };
}

/** The algorithm of the signing key (the first): ES256 unless the key says otherwise. */
export function signingAlgorithm(keys: {
  keys: JWK[];
}): AsymmetricSigningAlgorithm {
  const key = keys.keys[0];
  return (key.alg ??
    (key.kty === 'RSA' ? 'RS256' : 'ES256')) as AsymmetricSigningAlgorithm;
}
