import type {
  components,
  operations,
  paths,
} from './generated/hephaestus-api.js';

/**
 * Types generated from ../contracts/hephaestus.openapi.yaml (run
 * `pnpm generate:api`). HTTP DTOs implement these so the compiler flags any
 * drift between the controllers and the published contract.
 */
export type ApiSchemas = components['schemas'];

/** One named schema; usable in `implements` clauses, unlike `ApiSchemas['X']`. */
export type ApiSchema<K extends keyof ApiSchemas> = ApiSchemas[K];
export type ApiPaths = paths;
export type ApiOperations = operations;
