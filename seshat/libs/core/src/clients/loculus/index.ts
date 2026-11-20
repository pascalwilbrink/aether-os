/**
 * Loculus's HTTP API, generated from ../contracts/loculus.openapi.yaml
 * (`pnpm generate:api`). Seshat only reads files (with its own token,
 * `platform:read`), through the `DocumentFiles` interface (libs/knowledge).
 */
export * as LoculusApi from './generated/index.js';
export { createClient as createLoculusHttpClient } from './generated/client/index.js';
