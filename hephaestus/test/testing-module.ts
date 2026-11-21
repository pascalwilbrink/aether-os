import type { DynamicModule, Type } from '@nestjs/common';
import {
  Test,
  type TestingModule,
  type TestingModuleBuilder,
} from '@nestjs/testing';

import {
  AuthModule,
  HEPHAESTUS_PUBLISHED_EVENTS,
  HephaestusEventsModule,
  DatabaseModule,
  EventsModule,
  hephaestusConfigModule,
} from '@hephaestus/core';
import { Pylon, PylonModels } from '@hephaestus/models';
import { PolisClient } from '@hephaestus/tenancy';

import {
  AGORA_SUBSCRIPTIONS,
  POLIS_SUBSCRIPTIONS,
  PROXENOS_SUBSCRIPTIONS,
} from '../src/app.module.js';
import { resetDatabase } from './database.js';
import { tokens } from './tokens.js';
import { FakePylon, ScriptedPylonModels } from './fake-models.js';
import { FakePolis } from './fake-polis.js';

export interface TestContext {
  moduleRef: TestingModule;
  polis: FakePolis;
  pylon: FakePylon;
  models: ScriptedPylonModels;
}

/**
 * A Nest context with Hephaestus's configuration and database (emptied), the
 * event inbox (no RabbitMQ: deliver events with `deliverPolisEvent`, or Agora's with `test/agora.ts`), a
 * fake Polis, and a fake Pylon with scripted models (`test/fake-models.ts`).
 */
export function createTestingModule(
  ...modules: (Type | DynamicModule)[]
): Promise<TestContext> {
  return createTestingModuleWith((builder) => builder, ...modules);
}

/** The same, with providers overridden (e.g. the runner's ports). */
export async function createTestingModuleWith(
  override: (builder: TestingModuleBuilder) => TestingModuleBuilder,
  ...modules: (Type | DynamicModule)[]
): Promise<TestContext> {
  const polis = new FakePolis();
  const models = new ScriptedPylonModels();
  const pylon = new FakePylon(models);
  const builder = Test.createTestingModule({
    imports: [
      hephaestusConfigModule(),
      DatabaseModule,
      EventsModule.forRoot({
        service: 'hephaestus',
        publish: HEPHAESTUS_PUBLISHED_EVENTS,
        subscribe: {
          polis: POLIS_SUBSCRIPTIONS,
          proxenos: PROXENOS_SUBSCRIPTIONS,
          agora: AGORA_SUBSCRIPTIONS,
        },
      }),
      // AccessControl; tests act as a principal with actingAs().
      AuthModule.forRoot({ issuer: tokens.issuer, jwks: tokens.jwks }),
      HephaestusEventsModule,
      ...modules,
    ],
  })
    .overrideProvider(PolisClient)
    .useValue(polis)
    .overrideProvider(Pylon)
    .useValue(pylon)
    .overrideProvider(PylonModels)
    .useValue(models);
  const moduleRef = await override(builder).compile();
  await moduleRef.init();
  await resetDatabase(moduleRef);

  return { moduleRef, polis, pylon, models };
}
