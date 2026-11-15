import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

/** The Postgres version tests run against: the one in docker-compose.yml. */
export const POSTGRES_TEST_IMAGE =
  process.env.POSTGRES_TEST_IMAGE ?? 'postgres:17.5-alpine';

export interface TestPostgres {
  url: string;
  stop(): Promise<void>;
}

/**
 * Starts a throwaway Postgres in a container (Testcontainers), for a test
 * run's global setup. Tests never use SQLite (docs/engineering.md).
 */
export async function startTestPostgres(): Promise<TestPostgres> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    POSTGRES_TEST_IMAGE,
  ).start();

  return {
    url: container.getConnectionUri(),
    stop: async () => {
      await container.stop();
    },
  };
}
