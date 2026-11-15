import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { postgresOptions } from '@aether-os/krepis';

import { OrganizationEntity } from '../../libs/organizations/src/organization.entity.js';
import { ProjectEntity } from '../../libs/projects/src/project.entity.js';
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
    entities: [OrganizationEntity, ProjectEntity],
  }),
);
