import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';

import type { OrganizationRole, ProjectRole } from '@aether-os/krepis';
import {
  configurePylonApp,
  EventConsumer,
  EventInbox,
  SecretStore,
} from '@pylon/core';
import { PolisClient } from '@pylon/tenancy';

import { AppModule } from '../src/app.module.js';
import { resetDatabase } from './database.js';
import { providers } from './fake-providers.js';
import { FakePolis } from './fake-polis.js';
import { FakeSecretStore } from './fake-secrets.js';
import { tokens } from './tokens.js';

/** The whole Pylon app, configured as in server.ts, on an empty database. */
export async function createApp(): Promise<{
  app: INestApplication<App>;
  polis: FakePolis;
  secrets: FakeSecretStore;
}> {
  const polis = new FakePolis();
  const secrets = new FakeSecretStore();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PolisClient)
    .useValue(polis)
    .overrideProvider(SecretStore)
    .useValue(secrets)
    .compile();
  const app = configurePylonApp(
    moduleRef.createNestApplication<NestExpressApplication>({ logger: false }),
  );
  await app.init();
  // Agora's queue is declared before a test can end (and close the channel).
  await app.get(EventConsumer).ready();
  await resetDatabase(app);
  providers.reset();
  return { app: app as unknown as INestApplication<App>, polis, secrets };
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

export const TASK_ID = '0193a1b2-c3d4-7e5f-8a9b-00000000aaaa';
export const TREE_ID = '0193a1b2-c3d4-7e5f-8a9b-00000000bbbb';
export const AGENT_VERSION_ID = '0193a1b2-c3d4-7e5f-8a9b-00000000cccc';

/** A task token's claims, as Pistis exchanges it for Hephaestus (docs/pylon.md). */
export const taskToken = (
  organizationId: string,
  projectId: string,
  options: { role?: ProjectRole; agentId?: string | null } = {},
) =>
  tokens.sign({
    sub: 'service-account-1',
    sub_type: 'service_account',
    org_id: organizationId,
    org_roles: ['member'],
    project_roles: { [projectId]: options.role ?? 'editor' },
    project_id: projectId,
    task_id: TASK_ID,
    task_tree_id: TREE_ID,
    ...(options.agentId
      ? { agent_id: options.agentId, agent_version_id: AGENT_VERSION_ID }
      : {}),
    act: { sub: 'hephaestus', sub_type: 'service' },
    scope: 'api',
  });

export const asTask = async (
  app: INestApplication<App>,
  organizationId: string,
  projectId: string,
  options: { role?: ProjectRole; agentId?: string | null } = {},
) => client(app, await taskToken(organizationId, projectId, options));

export const SESSION_ID = '0193a1b2-c3d4-7e5f-8a9b-00000000eeee';

/** A session token's claims, as Pistis exchanges it for Hephaestus (docs/interaction.md). */
export const sessionToken = (
  organizationId: string,
  projectId: string,
  options: { role?: ProjectRole; agentId?: string } = {},
) =>
  tokens.sign({
    sub: 'user-1',
    sub_type: 'user',
    org_id: organizationId,
    org_roles: ['member'],
    project_roles: { [projectId]: options.role ?? 'viewer' },
    project_id: projectId,
    session_id: SESSION_ID,
    ...(options.agentId
      ? { agent_id: options.agentId, agent_version_id: AGENT_VERSION_ID }
      : {}),
    act: { sub: 'hephaestus', sub_type: 'service' },
    scope: 'api',
  });

/** A platform service's own token (Seshat: `model:invoke`; Hephaestus: `platform:read`). */
export const asPlatform = async (
  app: INestApplication<App>,
  scopes: string[],
) => client(app, await tokens.service('seshat', scopes));

/** Agora created an agent (`agent.created`), delivered as the consumer would. */
export async function agoraAgent(
  app: INestApplication<App>,
  organizationId: string,
  agentId = uuidv7(),
): Promise<string> {
  await app.get(EventInbox).receive('agora', {
    eventId: uuidv7(),
    eventType: 'agent.created',
    schemaVersion: 1,
    aggregateId: agentId,
    aggregateVersion: 1,
    occurredAt: new Date(),
    organizationId,
    projectId: null,
    actor: { sub: 'user-1', sub_type: 'user' },
    payload: {
      agentId,
      name: 'Helper',
      description: '',
      createdBy: 'user-1',
      createdAt: new Date().toISOString(),
    },
  });
  return agentId;
}
