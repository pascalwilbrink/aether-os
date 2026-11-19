import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import type { OrganizationRole, ProjectRole } from '@aether-os/krepis';
import { configureHttpApp, SecretStore } from '@proxenos/core';
import { PolisClient } from '@proxenos/tenancy';

import { AppModule } from '../src/app.module.js';
import { resetDatabase } from './database.js';
import { FakePolis } from './fake-polis.js';
import { github } from './github.js';
import { tokens } from './tokens.js';

export const WEBHOOK_SECRET = 'webhook-secret';

/** The GitHub App's secrets, as OpenBao would hold them. */
class FakeSecretStore extends SecretStore {
  read(path: string): Promise<Record<string, unknown> | null> {
    return Promise.resolve(
      path === 'platform/github-app'
        ? {
            privateKey: github.keys.privateKey,
            clientSecret: 'client-secret',
            webhookSecret: WEBHOOK_SECRET,
          }
        : null,
    );
  }

  write(): Promise<void> {
    return Promise.reject(new Error('Proxenos never writes secrets'));
  }

  delete(): Promise<void> {
    return Promise.reject(new Error('Proxenos never deletes secrets'));
  }
}

/** The whole Proxenos app, configured as in main.ts, on an empty database. */
export async function createApp(): Promise<{
  app: INestApplication<App>;
  polis: FakePolis;
}> {
  const polis = new FakePolis();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PolisClient)
    .useValue(polis)
    .overrideProvider(SecretStore)
    .useValue(new FakeSecretStore())
    .compile();
  const app = configureHttpApp(
    moduleRef.createNestApplication({ logger: false, rawBody: true }),
  );
  await app.init();
  await resetDatabase(app);
  github.reset();
  return { app: app as INestApplication<App>, polis };
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
      task_id: '0193a1b2-c3d4-7e5f-8a9b-00000000aaaa',
      act: { sub: 'hephaestus', sub_type: 'service' },
      scope: 'api',
    }),
  );
