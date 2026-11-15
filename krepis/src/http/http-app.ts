import type { INestApplication } from '@nestjs/common';

import { ProblemDetailsFilter } from './problem-details.filter.js';
import { ProblemValidationPipe } from './problem-validation.pipe.js';

/** Every endpoint is under the major version (docs/api.md). */
export const API_VERSION_PREFIX = 'v1';

/** Paths fixed by external standards, served without the version prefix. */
export const UNVERSIONED_PATHS = ['health'];

/**
 * Applies the platform's HTTP conventions to a Nest app: the `/v1` prefix,
 * strict validation, and problem details for every error. Call it once in
 * `main.ts` and on every app an e2e test creates, before `init()`.
 *
 * Unknown paths under the prefix get `404 NOT_FOUND` problem details; Nest
 * leaves paths outside it (other than `UNVERSIONED_PATHS`) to Express's plain
 * 404, which no client should reach.
 */
export function configureHttpApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix(API_VERSION_PREFIX, { exclude: UNVERSIONED_PATHS });
  app.useGlobalPipes(new ProblemValidationPipe());
  app.useGlobalFilters(new ProblemDetailsFilter());

  return app;
}
