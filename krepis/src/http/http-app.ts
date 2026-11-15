import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ZodSerializerInterceptor } from 'nestjs-zod';

import { runWithTraceContext } from '../telemetry/trace-context.js';

import { ProblemDetailsFilter } from './problem-details.filter.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

/** Every endpoint is under the major version (docs/api.md). */
export const API_VERSION_PREFIX = 'v1';

/** Paths fixed by external standards, served without the version prefix. */
export const UNVERSIONED_PATHS = ['health'];

/**
 * Applies the platform's HTTP conventions to a Nest app: the `/v1` prefix,
 * strict validation of Zod DTOs (`ZodValidationPipe`), responses checked and stripped
 * against their schema where a handler declares `@ZodSerializerDto`,
 * problem details for every error, and the request's trace context
 * (`traceparent`) kept for the request, so events emitted while handling it
 * carry it on. Call it once in `main.ts` and on every app
 * an e2e test creates, before `init()`.
 *
 * Unknown paths under the prefix get `404 NOT_FOUND` problem details; Nest
 * leaves paths outside it (other than `UNVERSIONED_PATHS`) to Express's plain
 * 404, which no client should reach.
 */
export function configureHttpApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix(API_VERSION_PREFIX, { exclude: UNVERSIONED_PATHS });
  app.use(
    (
      request: { headers: Record<string, string | string[] | undefined> },
      _response: unknown,
      next: () => void,
    ) => runWithTraceContext(request.headers, next),
  );
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalInterceptors(new ZodSerializerInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new ProblemDetailsFilter());

  return app;
}
