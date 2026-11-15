import { Controller, Get, Header, Inject } from '@nestjs/common';

import { Public } from '@pistis/core';

import { publicKeys, SIGNING_KEYS, type SigningKeys } from './token-signer.js';

/**
 * Pistis's public signing keys at the conventional `/.well-known/jwks.json`,
 * for tools that look there. The same keys as oidc-provider's `jwks_uri`
 * (`/oidc/jwks`), which is what discovery advertises and services use.
 */
@Controller('.well-known')
@Public()
export class JwksController {
  constructor(@Inject(SIGNING_KEYS) private readonly keys: SigningKeys) {}

  @Get('jwks.json')
  // Short enough for a rotation to show up quickly.
  @Header('cache-control', 'public, max-age=300')
  jwks(): { keys: Record<string, unknown>[] } {
    return publicKeys(this.keys);
  }
}
