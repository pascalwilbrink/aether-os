/**
 * Loculus's HTTP API, generated from ../contracts/loculus.openapi.yaml
 * (`pnpm generate:api`): `LoculusApi.createFile({ client, path, body })`
 * etc., with `createLoculusHttpClient`. The runner reaches it through the
 * `FileStore` port (libs/runner).
 */
export * as LoculusApi from './generated/index.js';
export { createClient as createLoculusHttpClient } from './generated/client/index.js';
