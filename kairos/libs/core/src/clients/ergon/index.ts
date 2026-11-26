/**
 * Ergon's HTTP API, generated from ../contracts/ergon.openapi.yaml
 * (`pnpm generate:api`): `ErgonApi.getWorkItem({ client, path })`, with
 * `createClient` from ./generated/client. Services go through the
 * `ErgonClient` interface (libs/automations).
 */
export * as ErgonApi from './generated/index.js';
export { createClient as createErgonHttpClient } from './generated/client/index.js';
