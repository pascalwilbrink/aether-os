import type { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Empties every table, so each test starts from a clean database. */
export async function resetDatabase(
  app: INestApplicationContext,
): Promise<void> {
  await app
    .get(DataSource)
    .query(
      'TRUNCATE organization_members, project_members, organization_syncs, notifications, email_deliveries, outbox, inbox',
    );
}
