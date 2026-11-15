import type { DynamicModule, Type } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  AuthModule,
  DatabaseModule,
  EventsModule,
  POLIS_PUBLISHED_EVENTS,
  PolisEventsModule,
  polisConfigModule,
} from '@polis/core';

import { resetDatabase } from './database.js';
import { tokens } from './tokens.js';

/** A Nest context with Polis's real configuration and database, emptied. */
export async function createTestingModule(
  ...modules: (Type | DynamicModule)[]
): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      polisConfigModule(),
      DatabaseModule,
      // Events are stored in the outbox; no relay, so nothing is published.
      EventsModule.forRoot({
        service: 'polis',
        publish: POLIS_PUBLISHED_EVENTS,
      }),
      PolisEventsModule,
      // AccessControl; tests act as a principal with actingAs().
      AuthModule.forRoot({ issuer: tokens.issuer, jwks: tokens.jwks }),
      ...modules,
    ],
  }).compile();
  await moduleRef.init();
  await resetDatabase(moduleRef);

  return moduleRef;
}
