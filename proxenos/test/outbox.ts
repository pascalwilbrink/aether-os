import type { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';

import type { DomainEvent } from '@proxenos/core';

/** The events stored in the outbox, oldest first. */
export async function outboxEvents(
  app: INestApplicationContext,
): Promise<DomainEvent[]> {
  const rows: { message: DomainEvent }[] = await app
    .get(DataSource)
    .query('SELECT message FROM outbox ORDER BY created_at, id');

  return rows.map((row) => row.message);
}
