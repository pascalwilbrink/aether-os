import type { DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from '@aether-os/krepis';

import { zEnv } from './env.js';

/**
 * Configuration from environment variables (and `.env` locally), validated
 * once at startup: a missing or invalid value stops Polis with a clear
 * message. A function, so importing @polis/core doesn't validate anything.
 */
export function polisConfigModule(): Promise<DynamicModule> {
  return ConfigModule.forRoot({
    isGlobal: true,
    cache: true,
    validate: validateEnv(zEnv),
  });
}
