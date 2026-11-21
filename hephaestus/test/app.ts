import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { App } from 'supertest/types.js';

import { configureHttpApp, EventConsumer } from '@hephaestus/core';
import { Pylon, PylonModels } from '@hephaestus/models';
import { PolisClient } from '@hephaestus/tenancy';

import { AppModule } from '../src/app.module.js';
import { resetDatabase } from './database.js';
import { FakePylon, ScriptedPylonModels } from './fake-models.js';
import { FakePolis } from './fake-polis.js';

/**
 * The whole Hephaestus app, configured as in main.ts, on an empty database,
 * consuming from the run's RabbitMQ, with a fake Polis behind PolisClient
 * and a fake Pylon (budgets, usage) and scripted models behind Pylon's ports.
 */
export async function createApp(
  override: (builder: TestingModuleBuilder) => TestingModuleBuilder = (
    builder,
  ) => builder,
): Promise<{
  app: INestApplication<App>;
  polis: FakePolis;
  pylon: FakePylon;
}> {
  const polis = new FakePolis();
  const models = new ScriptedPylonModels();
  const pylon = new FakePylon(models);
  const moduleRef = await override(
    Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PolisClient)
      .useValue(polis)
      .overrideProvider(Pylon)
      .useValue(pylon)
      .overrideProvider(PylonModels)
      .useValue(models),
  ).compile();
  const app = configureHttpApp(
    moduleRef.createNestApplication({ logger: false }),
  );
  await app.init();
  // Consuming before the test starts (and before it can be shut down).
  await app.get(EventConsumer).ready();
  await resetDatabase(app);

  return { app: app as INestApplication<App>, polis, pylon };
}

/** A valid UUID that no resource has. */
export const MISSING_ID = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
