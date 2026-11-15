import type { TestProject } from 'vitest/node';

import { startTestPostgres } from '../src/testing/postgres.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Vitest global setup: one Postgres container per test run, its URL provided
 * to tests as `inject('databaseUrl')`.
 */
export default async function setup(project: TestProject) {
  const postgres = await startTestPostgres();
  project.provide('databaseUrl', postgres.url);

  return async () => {
    await postgres.stop();
  };
}
