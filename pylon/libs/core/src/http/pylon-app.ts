import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { configureHttpApp } from '@aether-os/krepis';

import type { Env } from '../config/env.js';

/**
 * Krepis's HTTP conventions (`configureHttpApp`), and JSON bodies up to
 * `PROVIDER_MAX_REQUEST_BYTES`: model calls carry whole conversations,
 * images included (Express's default is 100 KB).
 */
export function configurePylonApp<T extends NestExpressApplication>(app: T): T {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  app.useBodyParser('json', {
    limit: config.get('PROVIDER_MAX_REQUEST_BYTES', { infer: true }),
  });
  configureHttpApp(app);
  return app;
}
