import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import type { OrganizationRole, ProjectRole } from '@aether-os/krepis';

import { tokens } from './tokens.js';

export type Client = ReturnType<typeof request.agent>;

/** Requests with `Authorization: Bearer <token>`. */
export const client = (app: INestApplication<App>, token: string): Client =>
  request.agent(app.getHttpServer()).set('authorization', `Bearer ${token}`);

/** A platform operator: a service token with every platform permission. */
export const asOperator = async (app: INestApplication<App>) =>
  client(
    app,
    await tokens.service('operator', ['platform:read', 'platform:manage']),
  );

/** A signed-in user with a token for no organization (to found one). */
export const asUser = async (app: INestApplication<App>, sub = 'user-1') =>
  client(app, await tokens.user({ sub }));

/** A user (or service account) in an organization, with these roles. */
export const asMember = async (
  app: INestApplication<App>,
  organizationId: string,
  roles: OrganizationRole[],
  options: {
    sub?: string;
    projectRoles?: Record<string, ProjectRole>;
    subType?: 'user' | 'service_account';
  } = {},
) =>
  client(
    app,
    await tokens.user({
      sub: options.sub ?? 'user-1',
      organizationId,
      roles,
      projectRoles: options.projectRoles,
      subType: options.subType,
    }),
  );

export const asOwner = (
  app: INestApplication<App>,
  organizationId: string,
  sub = 'user-1',
) => asMember(app, organizationId, ['owner'], { sub });

/** Creates an organization as `founder`, who becomes its owner. */
export async function foundOrganization(
  app: INestApplication<App>,
  slug: string,
  founder = 'user-1',
): Promise<{ id: string; slug: string }> {
  const res = await (
    await asUser(app, founder)
  )
    .post('/v1/organizations')
    .send({ name: slug, slug })
    .expect(201);
  return res.body as { id: string; slug: string };
}
