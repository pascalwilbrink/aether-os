import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import type { OrganizationRole, ProjectRole } from '@aether-os/krepis';
import { configureHttpApp, EventConsumer } from '@kairos/core';
import { ErgonClient } from '@kairos/automations';
import { PolisClient } from '@kairos/tenancy';

import { AppModule } from '../src/app.module.js';
import { resetDatabase } from './database.js';
import { FakeErgon } from './fake-ergon.js';
import { FakePolis } from './fake-polis.js';
import { tokens } from './tokens.js';

/** The whole Kairos app, configured as in main.ts, on an empty database. */
export async function createApp(): Promise<{
  app: INestApplication<App>;
  polis: FakePolis;
  ergon: FakeErgon;
}> {
  const polis = new FakePolis();
  const ergon = new FakeErgon();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PolisClient)
    .useValue(polis)
    .overrideProvider(ErgonClient)
    .useValue(ergon)
    .compile();
  const app = configureHttpApp(
    moduleRef.createNestApplication({ logger: false }),
  );
  await app.init();
  // Consuming before the test starts, so closing the app never cuts off a
  // channel that is still being set up (an unhandled rejection).
  await app.get(EventConsumer).ready();
  await resetDatabase(app);
  return { app: app as INestApplication<App>, polis, ergon };
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
