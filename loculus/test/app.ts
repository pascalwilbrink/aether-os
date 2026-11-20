import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import type { OrganizationRole, ProjectRole } from '@aether-os/krepis';
import { configureHttpApp } from '@loculus/core';

import { AppModule } from '../src/app.module.js';
import { resetDatabase } from './database.js';
import { tokens } from './tokens.js';

/** The whole Loculus app, configured as in main.ts, on an empty database. */
export async function createApp(
  override: (builder: TestingModuleBuilder) => TestingModuleBuilder = (
    builder,
  ) => builder,
): Promise<INestApplication<App>> {
  const moduleRef = await override(
    Test.createTestingModule({ imports: [AppModule] }),
  ).compile();
  const app = configureHttpApp(
    moduleRef.createNestApplication({ logger: false }),
  );
  await app.init();
  await resetDatabase(app);
  return app as INestApplication<App>;
}

export type Client = ReturnType<typeof request.agent>;

const client = (app: INestApplication<App>, token: string): Client =>
  request.agent(app.getHttpServer()).set('authorization', `Bearer ${token}`);

/** A person in an organization, with these roles. */
export const asMember = async (
  app: INestApplication<App>,
  organizationId: string,
  roles: OrganizationRole[],
  projectRoles?: Record<string, ProjectRole>,
) =>
  client(
    app,
    await tokens.user({ sub: 'user-1', organizationId, roles, projectRoles }),
  );

/** A task's token: a service account, limited to its project. */
export const asTask = async (
  app: INestApplication<App>,
  organizationId: string,
  projectId: string,
) =>
  client(
    app,
    await tokens.user({
      sub: 'sa-1',
      subType: 'service_account',
      organizationId,
      roles: ['member'],
      projectRoles: { [projectId]: 'editor' },
      projectId,
    }),
  );

/** A platform service's own token (no organization), e.g. Seshat's. */
export const asPlatform = async (
  app: INestApplication<App>,
  scopes: string[],
) => client(app, await tokens.service('seshat', scopes));
