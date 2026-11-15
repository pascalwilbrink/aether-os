import type { DynamicModule, Type } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  AuthModule,
  DatabaseModule,
  EventsModule,
  hephaestusConfigModule,
} from '@hephaestus/core';
import { PolisClient } from '@hephaestus/tenancy';

import { POLIS_SUBSCRIPTIONS } from '../src/app.module.js';
import { resetDatabase } from './database.js';
import { tokens } from './tokens.js';
import { FakePolis } from './fake-polis.js';

/**
 * A Nest context with Hephaestus's configuration and database (emptied), the
 * event inbox (no RabbitMQ: deliver events with `deliverPolisEvent`), and a
 * fake Polis.
 */
export async function createTestingModule(
  ...modules: (Type | DynamicModule)[]
): Promise<{ moduleRef: TestingModule; polis: FakePolis }> {
  const polis = new FakePolis();
  const moduleRef = await Test.createTestingModule({
    imports: [
      hephaestusConfigModule(),
      DatabaseModule,
      EventsModule.forRoot({
        service: 'hephaestus',
        publish: [],
        subscribe: { polis: POLIS_SUBSCRIPTIONS },
      }),
      // AccessControl; tests act as a principal with actingAs().
      AuthModule.forRoot({ issuer: tokens.issuer, jwks: tokens.jwks }),
      ...modules,
    ],
  })
    .overrideProvider(PolisClient)
    .useValue(polis)
    .compile();
  await moduleRef.init();
  await resetDatabase(moduleRef);

  return { moduleRef, polis };
}
