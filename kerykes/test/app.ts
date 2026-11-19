import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import type { OrganizationRole, ProjectRole } from '@aether-os/krepis';
import { configureHttpApp, EventConsumer } from '@kerykes/core';
import { Directory } from '@kerykes/directory';
import { EmailSender } from '@kerykes/notifications';

import { AppModule } from '../src/app.module.js';
import { resetDatabase } from './database.js';
import { FakeDirectory } from './fake-directory.js';
import { FakeEmailSender } from './fake-email.js';
import { tokens } from './tokens.js';

/** The whole Kerykes app, configured as in main.ts, on an empty database. */
export async function createApp(): Promise<{
  app: INestApplication<App>;
  directory: FakeDirectory;
  email: FakeEmailSender;
}> {
  const directory = new FakeDirectory();
  const email = new FakeEmailSender();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Directory)
    .useValue(directory)
    .overrideProvider(EmailSender)
    .useValue(email)
    .compile();
  const app = configureHttpApp(
    moduleRef.createNestApplication({ logger: false }),
  );
  await app.init();
  // Consuming before the test starts, so closing the app never cuts off a
  // channel that is still being set up (an unhandled rejection).
  await app.get(EventConsumer).ready();
  await resetDatabase(app);
  return { app: app as INestApplication<App>, directory, email };
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

/** A token that isn't a user's (a service account's), in the organization. */
export const asServiceAccount = async (
  app: INestApplication<App>,
  organizationId: string,
) =>
  client(
    app,
    await tokens.user({
      sub: 'sa-1',
      organizationId,
      roles: ['member'],
      subType: 'service_account',
    }),
  );
