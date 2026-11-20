/**
 * Hephaestus's HTTP API, generated from ../contracts/hephaestus.openapi.yaml
 * (`pnpm generate:api`). Agora only calls `checkAgentVersion`, through the
 * `AgentVersionChecker` interface (libs/agents).
 */
export * as HephaestusApi from './generated/index.js';
export { createClient as createHephaestusHttpClient } from './generated/client/index.js';
