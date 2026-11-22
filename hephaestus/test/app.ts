import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { App } from 'supertest/types.js';

import { configureHttpApp, EventConsumer } from '@hephaestus/core';
import { Pylon, PylonModels } from '@hephaestus/models';
import { KnowledgeBase } from '@hephaestus/runner';
import { SessionTokens } from '@hephaestus/sessions';
import { TaskContextSource } from '@hephaestus/tasks';
import { PolisClient } from '@hephaestus/tenancy';

import { AppModule } from '../src/app.module.js';
import { resetDatabase } from './database.js';
import { FakePylon, ScriptedPylonModels } from './fake-models.js';
import { FakeKnowledgeBase, FakeTaskContextSource } from './fake-knowledge.js';
import { FakeSessionTokens } from './fake-session-tokens.js';
import { FakePolis } from './fake-polis.js';

/**
 * The whole Hephaestus app, configured as in main.ts, on an empty database,
 * consuming from the run's RabbitMQ, with a fake Polis behind PolisClient
 * and a fake Pylon (budgets, usage) and scripted models behind Pylon's ports,
 * and Seshat's items for pinning knowledge on tasks (`knowledge`).
 */
export async function createApp(
  override: (builder: TestingModuleBuilder) => TestingModuleBuilder = (
    builder,
  ) => builder,
): Promise<{
  app: INestApplication<App>;
  polis: FakePolis;
  pylon: FakePylon;
  knowledge: FakeTaskContextSource;
  models: ScriptedPylonModels;
  sessionTokens: FakeSessionTokens;
  knowledgeBase: FakeKnowledgeBase;
}> {
  const polis = new FakePolis();
  const knowledge = new FakeTaskContextSource();
  const models = new ScriptedPylonModels();
  const pylon = new FakePylon(models);
  const sessionTokens = new FakeSessionTokens();
  const knowledgeBase = new FakeKnowledgeBase();
  const moduleRef = await override(
    Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PolisClient)
      .useValue(polis)
      .overrideProvider(Pylon)
      .useValue(pylon)
      .overrideProvider(PylonModels)
      .useValue(models)
      .overrideProvider(TaskContextSource)
      .useValue(knowledge)
      .overrideProvider(SessionTokens)
      .useValue(sessionTokens)
      .overrideProvider(KnowledgeBase)
      .useValue(knowledgeBase),
  ).compile();
  const app = configureHttpApp(
    moduleRef.createNestApplication({ logger: false }),
  );
  await app.init();
  // Consuming before the test starts (and before it can be shut down).
  await app.get(EventConsumer).ready();
  await resetDatabase(app);

  return {
    app: app as INestApplication<App>,
    polis,
    pylon,
    knowledge,
    models,
    sessionTokens,
    knowledgeBase,
  };
}

/** A valid UUID that no resource has. */
export const MISSING_ID = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
