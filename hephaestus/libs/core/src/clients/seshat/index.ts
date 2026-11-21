/**
 * Seshat's HTTP API, generated from ../contracts/seshat.openapi.yaml
 * (`pnpm generate:api`): the knowledge tools reach it through the
 * `KnowledgeBase` port (libs/runner), with the task's own token.
 */
export * as SeshatApi from './generated/index.js';
export { createClient as createSeshatHttpClient } from './generated/client/index.js';
