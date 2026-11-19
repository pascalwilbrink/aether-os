/**
 * Pistis's HTTP API, generated from ../contracts/pistis.openapi.yaml
 * (`pnpm generate:api`). Services don't call it directly: they go through
 * the `Directory` interface (libs/directory).
 */
export * as PistisApi from './generated/index.js';
export { createClient as createPistisHttpClient } from './generated/client/index.js';
