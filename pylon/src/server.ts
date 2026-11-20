import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { createLogger } from '@aether-os/krepis';

import {
  configurePylonApp,
  initializeTransactions,
  type Env,
} from '@pylon/core';

import { AppModule } from './app.module.js';

// Winston, as every service's (docs/engineering.md, Logging): JSON lines on
// stdout, and to Loki through the Collector when telemetry runs.
const logger = createLogger({ service: 'pylon' });

// Before Nest boots, so @Transactional() methods find their context.
initializeTransactions();

const app = configurePylonApp(
  await NestFactory.create<NestExpressApplication>(AppModule, { logger }),
);
const config = app.get<ConfigService<Env, true>>(ConfigService);
await app.listen(config.get('PORT', { infer: true }));
