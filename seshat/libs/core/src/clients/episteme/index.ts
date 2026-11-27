/**
 * Episteme's HTTP API, generated from ../contracts/episteme.openapi.yaml
 * (`pnpm generate:api`). Seshat only reads a resource and its published
 * version (with its own token, `platform:read`), through the
 * `EpistemeSource` interface (libs/knowledge).
 */
export * as EpistemeApi from './generated/index.js';
export { createClient as createEpistemeHttpClient } from './generated/client/index.js';
