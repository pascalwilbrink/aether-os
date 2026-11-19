import type { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Empties every table, so each test starts from a clean database. */
export async function resetDatabase(
  app: INestApplicationContext,
): Promise<void> {
  await app
    .get(DataSource)
    .query('TRUNCATE automations, automation_runs, outbox, inbox');
}
