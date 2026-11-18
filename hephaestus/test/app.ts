import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { App } from 'supertest/types.js';

import { configureHttpApp, EventConsumer } from '@hephaestus/core';
import { PolisClient } from '@hephaestus/tenancy';

import { AppModule } from '../src/app.module.js';
import { resetDatabase } from './database.js';
import { FakePolis } from './fake-polis.js';

/**
 * The whole Hephaestus app, configured as in main.ts, on an empty database,
 * consuming from the run's RabbitMQ, with a fake Polis behind PolisClient.
 */
export async function createApp(
  override: (builder: TestingModuleBuilder) => TestingModuleBuilder = (
    builder,
  ) => builder,
): Promise<{
  app: INestApplication<App>;
  polis: FakePolis;
}> {
  const polis = new FakePolis();
  const moduleRef = await override(
    Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PolisClient)
      .useValue(polis),
  ).compile();
  const app = configureHttpApp(
    moduleRef.createNestApplication({ logger: false }),
  );
  await app.init();
  // Consuming before the test starts (and before it can be shut down).
  await app.get(EventConsumer).ready();
  await resetDatabase(app);

  return { app: app as INestApplication<App>, polis };
}

/** A valid UUID that no resource has. */
export const MISSING_ID = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
