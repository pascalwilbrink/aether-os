import { DataSource } from 'typeorm';
import type { TestProject } from 'vitest/node';

import { postgresOptions } from '@aether-os/krepis';
import { startTestPostgres } from '@aether-os/krepis/testing';

import { AgentVersionEntity } from '../libs/agents/src/agent-version.entity.js';
import { AgentEntity } from '../libs/agents/src/agent.entity.js';
import { OrganizationEntity } from '../libs/organizations/src/organization.entity.js';
import { ProjectEntity } from '../libs/projects/src/project.entity.js';
import { WorkspaceEntity } from '../libs/workspaces/src/workspace.entity.js';
import { migrations } from '../src/database/migrations/index.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Starts Postgres, applies the migrations (tests run against the migrated
 * schema, never a synchronized one) and fails if the entities no longer match
 * it, i.e. a migration is missing.
 */
export default async function setup(project: TestProject) {
  const postgres = await startTestPostgres();
  const dataSource = new DataSource(
    postgresOptions({
      url: postgres.url,
      migrations,
      entities: [
        OrganizationEntity,
        ProjectEntity,
        AgentEntity,
        AgentVersionEntity,
        WorkspaceEntity,
      ],
    }),
  );
  await dataSource.initialize();
  await dataSource.runMigrations();

  const pending = await dataSource.driver.createSchemaBuilder().log();
  await dataSource.destroy();
  if (pending.upQueries.length > 0) {
    await postgres.stop();
    throw new Error(
      'The entities differ from the migrated schema; generate a migration:\n' +
        pending.upQueries.map((query) => `  ${query.query}`).join('\n'),
    );
  }

  project.provide('databaseUrl', postgres.url);

  return async () => {
    await postgres.stop();
  };
}
