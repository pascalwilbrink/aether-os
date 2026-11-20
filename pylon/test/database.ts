import type { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Empties every table, so each test starts from a clean database; the
 * catalogue keeps what the migrations seeded.
 */
export async function resetDatabase(
  app: INestApplicationContext,
): Promise<void> {
  await app
    .get(DataSource)
    .query('TRUNCATE agents, model_keys, model_calls, budgets, outbox, inbox');
}
