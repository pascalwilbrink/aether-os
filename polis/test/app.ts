import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';

import { configureHttpApp, EventConsumer } from '@polis/core';

import { AppModule } from '../src/app.module.js';
import { resetDatabase } from './database.js';

/** The whole Polis app, configured as in main.ts, on an empty database. */
export async function createApp(): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = configureHttpApp(
    moduleRef.createNestApplication({ logger: false }),
  );
  await app.init();
  // Consuming Pistis's events: wait until the queues are declared, so a
  // test that closes the app early doesn't cut the consumer's channel.
  await app.get(EventConsumer).ready();
  await resetDatabase(app);

  return app as INestApplication<App>;
}

/** A valid UUID that no resource has. */
export const MISSING_ID = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
