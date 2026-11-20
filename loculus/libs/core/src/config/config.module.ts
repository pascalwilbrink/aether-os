import type { DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from '@aether-os/krepis';

import { zEnv } from './env.js';

/**
 * Configuration from environment variables (and `.env` locally), validated
 * once at startup: a missing or invalid value stops Loculus with a clear
 * message. A function, so importing @loculus/core doesn't validate anything.
 */
export function loculusConfigModule(): Promise<DynamicModule> {
  return ConfigModule.forRoot({
    isGlobal: true,
    cache: true,
    validate: validateEnv(zEnv),
  });
}
