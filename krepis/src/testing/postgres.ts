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
 * Postgres with pgvector (Seshat's embeddings), the same server and version
 * as `POSTGRES_TEST_IMAGE`: the one in docker-compose.yml.
 */
export const PGVECTOR_TEST_IMAGE =
  process.env.PGVECTOR_TEST_IMAGE ?? 'pgvector/pgvector:0.8.0-pg17';

/**
 * Starts a throwaway Postgres in a container (Testcontainers), for a test
 * run's global setup. Tests never use SQLite (docs/engineering.md).
 */
export async function startTestPostgres(
  image: string = POSTGRES_TEST_IMAGE,
): Promise<TestPostgres> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    image,
  ).start();

  return {
    url: container.getConnectionUri(),
    stop: async () => {
      await container.stop();
    },
  };
}
