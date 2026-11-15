import type { TestProject } from 'vitest/node';

import { startTestPostgres } from '../src/testing/postgres.js';
import { startTestRabbitMq } from '../src/testing/rabbitmq.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    rabbitmqUrl: string;
  }
}

/**
 * Vitest global setup: one Postgres and one RabbitMQ container per test run,
 * provided to tests as `inject('databaseUrl')` / `inject('rabbitmqUrl')`.
 */
export default async function setup(project: TestProject) {
  const [postgres, rabbitmq] = await Promise.all([
    startTestPostgres(),
    startTestRabbitMq(),
  ]);
  project.provide('databaseUrl', postgres.url);
  project.provide('rabbitmqUrl', rabbitmq.url);

  return async () => {
    await Promise.all([postgres.stop(), rabbitmq.stop()]);
  };
}
