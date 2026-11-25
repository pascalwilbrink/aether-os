import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import type { OrganizationRole, ProjectRole } from '@aether-os/krepis';
import { configureHttpApp, EventConsumer } from '@seshat/core';
import {
  DocumentFiles,
  Embeddings,
  NoEmbeddings,
  RepositoryFiles,
} from '@seshat/knowledge';
import { PolisClient } from '@seshat/tenancy';

import { AppModule } from '../src/app.module.js';
import { resetDatabase } from './database.js';
import { FakeEmbeddings } from './fake-embeddings.js';
import { FakeFiles } from './fake-files.js';
import { FakePolis } from './fake-polis.js';
import { FakeRepositories } from './fake-repositories.js';
import { tokens } from './tokens.js';

/**
 * The whole Seshat app, configured as in main.ts, on an empty database,
 * with fakes for Polis, Loculus, Proxenos's repositories and Pylon's
 * embeddings (`embeddings: null` for none, as without PYLON_URL).
 */
export async function createApp(
  options: { embeddings?: Embeddings | null } = {},
): Promise<{
  app: INestApplication<App>;
  polis: FakePolis;
  files: FakeFiles;
  embeddings: FakeEmbeddings;
  repositories: FakeRepositories;
}> {
  const polis = new FakePolis();
  const files = new FakeFiles();
  const embeddings = new FakeEmbeddings();
  const repositories = new FakeRepositories();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PolisClient)
    .useValue(polis)
    .overrideProvider(DocumentFiles)
    .useValue(files)
    .overrideProvider(RepositoryFiles)
    .useValue(repositories)
    .overrideProvider(Embeddings)
    .useValue(
      options.embeddings === undefined
        ? embeddings
        : (options.embeddings ?? new NoEmbeddings()),
    )
    .compile();
  const app = configureHttpApp(
    moduleRef.createNestApplication({ logger: false }),
  );
  await app.init();
  // Queues bound before a test starts (and before it can close the app).
  await app.get(EventConsumer).ready();
  await resetDatabase(app);
  return {
    app: app as INestApplication<App>,
    polis,
    files,
    embeddings,
    repositories,
  };
}

export type Client = ReturnType<typeof request.agent>;

const client = (app: INestApplication<App>, token: string): Client =>
  request.agent(app.getHttpServer()).set('authorization', `Bearer ${token}`);

/** A person in an organization, with these roles. */
export const asMember = async (
  app: INestApplication<App>,
  organizationId: string,
  roles: OrganizationRole[],
  options: { sub?: string; projectRoles?: Record<string, ProjectRole> } = {},
) =>
  client(
    app,
    await tokens.user({
      sub: options.sub ?? 'user-1',
      organizationId,
      roles,
      projectRoles: options.projectRoles,
    }),
  );

/** A task token, as Pistis exchanges it for Hephaestus (docs/identity.md). */
export const TASK_ID = '0193a1b2-c3d4-7e5f-8a9b-00000000aaaa';

export const asTask = async (
  app: INestApplication<App>,
  organizationId: string,
  projectId: string,
  role: ProjectRole = 'editor',
) =>
  client(
    app,
    await tokens.sign({
      sub: 'service-account-1',
      sub_type: 'service_account',
      org_id: organizationId,
      org_roles: ['member'],
      project_roles: { [projectId]: role },
      project_id: projectId,
      task_id: TASK_ID,
      act: { sub: 'hephaestus', sub_type: 'service' },
      scope: 'api',
    }),
  );

/** A session token, as Pistis exchanges it for Hephaestus (docs/interaction.md). */
export const SESSION_ID = '0193a1b2-c3d4-7e5f-8a9b-00000000bbbb';
export const SESSION_AGENT_ID = '0193a1b2-c3d4-7e5f-8a9b-00000000cccc';

export const asSession = async (
  app: INestApplication<App>,
  organizationId: string,
  projectId: string,
  role: ProjectRole = 'editor',
) =>
  client(
    app,
    await tokens.sign({
      sub: 'user-1',
      sub_type: 'user',
      org_id: organizationId,
      org_roles: ['member'],
      project_roles: { [projectId]: role },
      project_id: projectId,
      session_id: SESSION_ID,
      agent_id: SESSION_AGENT_ID,
      agent_version_id: SESSION_AGENT_ID,
      act: { sub: 'hephaestus', sub_type: 'service' },
      scope: 'api',
    }),
  );

/** A platform service with its own token (Hephaestus pinning items on tasks). */
export const asService = async (
  app: INestApplication<App>,
  sub = 'hephaestus',
  scopes = ['platform:read'],
) => client(app, await tokens.service(sub, scopes));
