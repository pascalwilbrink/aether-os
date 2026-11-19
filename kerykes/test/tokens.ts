import { TestTokens } from '@aether-os/krepis/testing';

/**
 * Pistis for the test run: test/setup.ts creates the keys and points
 * PISTIS_ISSUER and PISTIS_JWKS at them, so test apps accept these tokens.
 */
export const tokens = await TestTokens.create();
