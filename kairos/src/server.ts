import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import {
  configureHttpApp,
  initializeTransactions,
  type Env,
} from '@kairos/core';

import { AppModule } from './app.module.js';

// Before Nest boots, so @Transactional() methods find their context.
initializeTransactions();

const app = configureHttpApp(await NestFactory.create(AppModule));
const config = app.get<ConfigService<Env, true>>(ConfigService);
await app.listen(config.get('PORT', { infer: true }));
