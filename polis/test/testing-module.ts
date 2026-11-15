import type { DynamicModule, Type } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { DatabaseModule, polisConfigModule } from '@polis/core';

import { resetDatabase } from './database.js';

/** A Nest context with Polis's real configuration and database, emptied. */
export async function createTestingModule(
  ...modules: (Type | DynamicModule)[]
): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [polisConfigModule(), DatabaseModule, ...modules],
  }).compile();
  await moduleRef.init();
  await resetDatabase(moduleRef);

  return moduleRef;
}
