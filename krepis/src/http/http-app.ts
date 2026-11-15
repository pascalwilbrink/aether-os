import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ZodSerializerInterceptor } from 'nestjs-zod';

import { runWithRequestContext } from '../auth/request-context.js';
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
 * carry it on, and a request context in which the `AuthGuard` (if the
 * service imports `AuthModule`) records the caller, the `actor` of the
 * events emitted while handling the request. Call it once in `main.ts` and on every app
 * an e2e test creates, before `init()`.
 *
 * Unknown paths under the prefix get `404 NOT_FOUND` problem details; Nest
 * leaves paths outside it (other than `UNVERSIONED_PATHS`) to Express's plain
 * 404, which no client should reach.
 */
export interface HttpAppOptions {
  /**
   * More routes served without `/v1`, for paths fixed by external standards
   * (e.g. Pistis's OpenID Connect sign-in pages, `interaction/*path`).
   */
  unversionedPaths?: string[];
}

export function configureHttpApp(
  app: INestApplication,
  options: HttpAppOptions = {},
): INestApplication {
  app.setGlobalPrefix(API_VERSION_PREFIX, {
    exclude: [...UNVERSIONED_PATHS, ...(options.unversionedPaths ?? [])],
  });
  app.use(
    (
      request: { headers: Record<string, string | string[] | undefined> },
      _response: unknown,
      next: () => void,
    ) =>
      runWithTraceContext(request.headers, () => runWithRequestContext(next)),
  );
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalInterceptors(new ZodSerializerInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new ProblemDetailsFilter());

  return app;
}
