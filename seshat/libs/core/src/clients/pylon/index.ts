/**
 * Pylon's HTTP API, generated from ../contracts/pylon.openapi.yaml
 * (`pnpm generate:api`). Seshat only calls `createEmbeddings`, through the
 * `Embeddings` port (libs/knowledge).
 */
export * as PylonApi from './generated/index.js';
export { createClient as createPylonHttpClient } from './generated/client/index.js';
