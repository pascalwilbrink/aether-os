import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { createLogger } from '@aether-os/krepis';

import {
  configureHttpApp,
  initializeTransactions,
  type Env,
} from '@proxenos/core';

import { AppModule } from './app.module.js';

// Winston, as every service's (docs/engineering.md, Logging): JSON lines on
// stdout, and to Loki through the Collector when telemetry runs.
const logger = createLogger({ service: 'proxenos' });

// Before Nest boots, so @Transactional() methods find their context.
initializeTransactions();

// The raw body too: webhook signatures are over exactly the bytes sent.
const app = configureHttpApp(
  await NestFactory.create(AppModule, { rawBody: true, logger }),
);
const config = app.get<ConfigService<Env, true>>(ConfigService);
await app.listen(config.get('PORT', { infer: true }));
