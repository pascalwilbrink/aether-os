import type { DynamicModule, Type } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import {
  DatabaseModule,
  EventsModule,
  PISTIS_PUBLISHED_EVENTS,
  PistisEventsModule,
  pistisConfigModule,
} from '@pistis/core';

import { resetDatabase } from './database.js';

/** A Nest context with Pistis's configuration, database and events, emptied. */
export async function createTestingModule(
  ...modules: (Type | DynamicModule)[]
): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      pistisConfigModule(),
      DatabaseModule,
      // Events are stored in the outbox; no relay, so nothing is published.
      EventsModule.forRoot({
        service: 'pistis',
        publish: PISTIS_PUBLISHED_EVENTS,
      }),
      PistisEventsModule,
      ...modules,
    ],
  }).compile();
  await moduleRef.init();
  await resetDatabase(moduleRef);

  return moduleRef;
}
