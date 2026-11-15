import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';

import request from 'supertest';

import { configurePistisApp, PolisDirectory, TokenSigner } from '@pistis/oidc';

import { AppModule } from '../src/app.module.js';
import { resetDatabase } from './database.js';
import { FakePolisDirectory } from './fake-polis-directory.js';

/**
 * The whole Pistis app, configured as in main.ts, on an empty database, with
 * Polis replaced by `polis` (memberships and organizations set by the test).
 */
export async function createApp(
  polis = new FakePolisDirectory(),
): Promise<INestApplication<App>> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PolisDirectory)
    .useValue(polis)
    .compile();
  const app = configurePistisApp(
    moduleRef.createNestApplication({ logger: false }),
  );
  await app.init();
  await resetDatabase(app);

  return app as INestApplication<App>;
}

/** A valid UUID that no resource has. */
export const MISSING_ID = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

/**
 * A client of Pistis's API as a platform operator would be: a service token
 * with `platform:manage`, signed with the app's own keys.
 */
export async function operatorAgent(app: INestApplication<App>) {
  const token = await app
    .get(TokenSigner)
    .sign(
      { sub: 'operator', sub_type: 'service', scope: 'platform:manage' },
      600,
    );
  return request
    .agent(app.getHttpServer())
    .set('authorization', `Bearer ${token}`);
}

/** A member of an organization (a user token for it), with these roles. */
export async function memberAgent(
  app: INestApplication<App>,
  organizationId: string,
  roles: string[],
  sub = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a00',
) {
  const token = await app.get(TokenSigner).sign(
    {
      sub,
      sub_type: 'user',
      org_id: organizationId,
      org_roles: roles,
      project_roles: {},
      scope: 'api',
    },
    600,
  );
  return request
    .agent(app.getHttpServer())
    .set('authorization', `Bearer ${token}`);
}
