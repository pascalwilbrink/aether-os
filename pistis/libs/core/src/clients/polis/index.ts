/**
 * Polis's HTTP API, generated from ../contracts/polis.openapi.yaml
 * (`pnpm generate:api`): `PolisApi.getOrganization({ client, path })` etc.,
 * with `createClient` from ./generated/client. Services don't call it
 * directly: they go through the `PolisDirectory` interface (libs/oidc).
 */
export * as PolisApi from './generated/index.js';
export { createClient as createPolisHttpClient } from './generated/client/index.js';
