import { DataSource } from 'typeorm';
import { ApiKeyEntity } from '../libs/service-accounts/src/api-key.entity.js';
import { ServiceAccountEntity } from '../libs/service-accounts/src/service-account.entity.js';
import type { TestProject } from 'vitest/node';

import { OutboxMessageEntity, postgresOptions } from '@aether-os/krepis';
import {
  startTestPostgres,
  startTestRabbitMq,
} from '@aether-os/krepis/testing';

import { OidcPayloadEntity } from '../libs/oidc/src/oidc-payload.entity.js';
import { PasswordCredentialEntity } from '../libs/users/src/password-credential.entity.js';
import { UserProviderEntity } from '../libs/users/src/user-provider.entity.js';
import { UserEntity } from '../libs/users/src/user.entity.js';
import { migrations } from '../src/database/migrations/index.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    rabbitmqUrl: string;
  }
}

/**
 * Starts Postgres and RabbitMQ, applies the migrations (tests run against the migrated
 * schema, never a synchronized one) and fails if the entities no longer match
 * it, i.e. a migration is missing.
 */
export default async function setup(project: TestProject) {
  const [postgres, rabbitmq] = await Promise.all([
    startTestPostgres(),
    startTestRabbitMq(),
  ]);
  const dataSource = new DataSource(
    postgresOptions({
      url: postgres.url,
      migrations,
      entities: [
        UserEntity,
        UserProviderEntity,
        PasswordCredentialEntity,
        OidcPayloadEntity,
        ServiceAccountEntity,
        ApiKeyEntity,
        OutboxMessageEntity,
      ],
    }),
  );
  await dataSource.initialize();
  await dataSource.runMigrations();

  const pending = await dataSource.driver.createSchemaBuilder().log();
  await dataSource.destroy();
  if (pending.upQueries.length > 0) {
    await Promise.all([postgres.stop(), rabbitmq.stop()]);
    throw new Error(
      'The entities differ from the migrated schema; generate a migration:\n' +
        pending.upQueries.map((query) => `  ${query.query}`).join('\n'),
    );
  }

  project.provide('databaseUrl', postgres.url);
  project.provide('rabbitmqUrl', rabbitmq.url);

  return async () => {
    await Promise.all([postgres.stop(), rabbitmq.stop()]);
  };
}
