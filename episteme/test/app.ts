import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';

import { configureHttpApp } from '@episteme/core';

import { AppModule } from '../src/app.module.js';
import { resetDatabase } from './database.js';

/** The whole Episteme app, configured as in main.ts, on an empty database. */
export async function createApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = configureHttpApp(
    moduleRef.createNestApplication({ logger: false }),
  );
  // Episteme consumes nothing yet; once it does, wait for
  // `app.get(EventConsumer).ready()` here, as the other services' tests do.
  await app.init();
  await resetDatabase(app);
  return app as INestApplication<App>;
}
