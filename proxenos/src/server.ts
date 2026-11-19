import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import {
  configureHttpApp,
  initializeTransactions,
  type Env,
} from '@proxenos/core';

import { AppModule } from './app.module.js';

// Before Nest boots, so @Transactional() methods find their context.
initializeTransactions();

// The raw body too: webhook signatures are over exactly the bytes sent.
const app = configureHttpApp(
  await NestFactory.create(AppModule, { rawBody: true }),
);
const config = app.get<ConfigService<Env, true>>(ConfigService);
await app.listen(config.get('PORT', { infer: true }));
