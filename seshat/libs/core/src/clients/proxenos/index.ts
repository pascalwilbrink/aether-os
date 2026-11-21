/**
 * Proxenos's HTTP API, generated from ../contracts/proxenos.openapi.yaml
 * (`pnpm generate:api`). Seshat only reads a linked repository's files and
 * blobs (with its own token, `platform:read`), through the
 * `RepositoryFiles` interface (libs/knowledge).
 */
export * as ProxenosApi from './generated/index.js';
export { createClient as createProxenosHttpClient } from './generated/client/index.js';
