import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { ApiKeyEntity } from '../../libs/service-accounts/src/api-key.entity.js';
import { ServiceAccountEntity } from '../../libs/service-accounts/src/service-account.entity.js';
import { postgresOptions } from '@aether-os/krepis';

import { OidcPayloadEntity } from '../../libs/oidc/src/oidc-payload.entity.js';
import { PasswordCredentialEntity } from '../../libs/users/src/password-credential.entity.js';
import { UserProviderEntity } from '../../libs/users/src/user-provider.entity.js';
import { UserEntity } from '../../libs/users/src/user.entity.js';
import { migrations } from './migrations/index.js';

/**
 * The data source the TypeORM CLI uses (`pnpm migration:run`,
 * `pnpm migration:generate`), on the compiled output in dist/. Entities are
 * listed here because the CLI doesn't run Nest's `autoLoadEntities`.
 */
try {
  process.loadEnvFile();
} catch {
  // No .env file: the environment is used as is.
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set (see .env.example)');
}

export default new DataSource(
  postgresOptions({
    url,
    migrations,
    entities: [
      UserEntity,
      UserProviderEntity,
      PasswordCredentialEntity,
      OidcPayloadEntity,
      ServiceAccountEntity,
      ApiKeyEntity,
    ],
  }),
);
