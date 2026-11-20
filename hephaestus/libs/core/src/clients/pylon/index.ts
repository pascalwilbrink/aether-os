/**
 * Pylon's HTTP API, generated from ../contracts/pylon.openapi.yaml
 * (`pnpm generate:api`): `PylonApi.checkBudgets({ client, path, body })`
 * etc., with `createPylonHttpClient`. Hephaestus reaches it through the
 * ports in libs/models.
 */
export * as PylonApi from './generated/index.js';
export { createClient as createPylonHttpClient } from './generated/client/index.js';
