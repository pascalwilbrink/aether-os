/**
 * Proxenos's HTTP API, generated from ../contracts/proxenos.openapi.yaml
 * (`pnpm generate:api`): `ProxenosApi.createRepositoryToken({ client, path,
 * body })` etc., with `createProxenosHttpClient`. The runner reaches it
 * through the `RepositoryTokens` port (libs/runner).
 */
export * as ProxenosApi from './generated/index.js';
export { createClient as createProxenosHttpClient } from './generated/client/index.js';
