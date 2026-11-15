import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { configureHttpApp } from '@pistis/core';

import { OIDC_PATH, OidcProviderService } from './oidc-provider.service.js';

type Handler = (req: Request, res: Response, next: NextFunction) => void;

/**
 * Pistis's HTTP setup: Krepis's conventions (with the sign-in pages and
 * `/.well-known/jwks.json` kept outside `/v1`) and oidc-provider mounted at `/oidc`. Call it before
 * `init()`: the provider is created when the app initializes, so the
 * handler is looked up on the first request.
 */
export function configurePistisApp<T extends INestApplication>(app: T): T {
  configureHttpApp(app, {
    unversionedPaths: ['interaction/{*path}', '.well-known/jwks.json'],
  });

  let handler: Handler | undefined;
  app.use(OIDC_PATH, (req: Request, res: Response, next: NextFunction) => {
    handler ??= app.get(OidcProviderService).provider.callback() as Handler;
    handler(req, res, next);
  });

  return app;
}
