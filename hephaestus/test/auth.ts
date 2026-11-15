import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import type { OrganizationRole, ProjectRole } from '@aether-os/krepis';

import { tokens } from './tokens.js';

export type Client = ReturnType<typeof request.agent>;

/** A member of an organization (`user-1` by default) with these roles. */
export async function asMember(
  app: INestApplication<App>,
  organizationId: string,
  roles: OrganizationRole[],
  projectRoles: Record<string, ProjectRole> = {},
  sub = 'user-1',
): Promise<Client> {
  const token = await tokens.user({ sub, organizationId, roles, projectRoles });
  return request
    .agent(app.getHttpServer())
    .set('authorization', `Bearer ${token}`);
}
