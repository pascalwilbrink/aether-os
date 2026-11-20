import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { createLogger } from '@aether-os/krepis';

import { initializeTransactions, type Env } from '@pistis/core';
import { configurePistisApp } from '@pistis/oidc';

import { AppModule } from './app.module.js';

// Winston, as every service's (docs/engineering.md, Logging): JSON lines on
// stdout, and to Loki through the Collector when telemetry runs.
const logger = createLogger({ service: 'pistis' });

// Before Nest boots, so @Transactional() methods find their context.
initializeTransactions();

const app = configurePistisApp(await NestFactory.create(AppModule, { logger }));
const config = app.get<ConfigService<Env, true>>(ConfigService);
await app.listen(config.get('PORT', { infer: true }));
