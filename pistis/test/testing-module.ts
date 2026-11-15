import type { DynamicModule, Type } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

import { DatabaseModule, pistisConfigModule } from '@pistis/core';

import { resetDatabase } from './database.js';

/** A Nest context with Pistis's configuration and database, emptied. */
export async function createTestingModule(
  ...modules: (Type | DynamicModule)[]
): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [pistisConfigModule(), DatabaseModule, ...modules],
  }).compile();
  await moduleRef.init();
  await resetDatabase(moduleRef);

  return moduleRef;
}
