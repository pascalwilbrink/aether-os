import 'reflect-metadata';

import {
  Controller,
  Get,
  type INestApplication,
  Param,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureHttpApp } from '../http/http-app.js';
import { TestTokens } from '../testing/tokens.js';
import { AccessControl } from './access-control.service.js';
import { AuthModule } from './auth.module.js';
import {
  Authenticated,
  CurrentPrincipal,
  PlatformAccess,
  Public,
  RequirePermission,
} from './decorators.js';
import type { Principal } from './principal.js';
import { currentActor } from './request-context.js';

const ORG = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const OTHER_ORG = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5e';
const PROJECT = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';

@Controller()
class ThingsController {
  constructor(private readonly access: AccessControl) {}

  @Get('health')
  @Public()
  health() {
    return { ok: true };
  }

  @Get('me')
  @Authenticated()
  me(@CurrentPrincipal() principal: Principal) {
    return {
      sub: principal.sub,
      actor: currentActor(),
      projects: this.access.readableProjects(),
    };
  }

  @Get('organizations/:organizationId/agents')
  @RequirePermission('agent:read')
  @PlatformAccess('platform:read')
  agents(@Param('organizationId') organizationId: string) {
    return { organizationId };
  }

  @Post('organizations/:organizationId/agents')
  @RequirePermission('agent:publish')
  publish() {
    return { published: true };
  }

  @Post('organizations/:organizationId/projects/:projectId/tasks')
  @RequirePermission('task:create', { project: 'projectId' })
  createTask() {
    return { created: true };
  }

  @Get('organizations')
  @PlatformAccess('platform:read')
  organizations() {
    return { all: true };
  }

  @Get('forgotten')
  forgotten() {
    return { oops: true };
  }
}

describe('AuthGuard', () => {
  let app: INestApplication;
  let tokens: TestTokens;

  beforeAll(async () => {
    tokens = await TestTokens.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        AuthModule.forRoot({ issuer: tokens.issuer, jwks: tokens.jwks }),
      ],
      controllers: [ThingsController],
    }).compile();
    app = configureHttpApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string, token?: string) => {
    const req = request(app.getHttpServer()).get(`/v1/${path}`);
    return token ? req.set('authorization', `Bearer ${token}`) : req;
  };
  const post = (path: string, token: string) =>
    request(app.getHttpServer())
      .post(`/v1/${path}`)
      .set('authorization', `Bearer ${token}`);

  it('lets public routes through', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('requires a valid token', async () => {
    const res = await get('me').expect(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    await get('me', 'not-a-token').expect(401);
    await get('me', await tokens.user({ expiresIn: '-1m' })).expect(401);
    await get(
      'me',
      await tokens.sign(
        { sub: 'x', sub_type: 'user' },
        '10m',
        'https://evil.test',
      ),
    ).expect(401);

    const other = await TestTokens.create();
    await get('me', await other.user()).expect(401);
  });

  it('records the principal for the request and its events', async () => {
    const token = await tokens.user({
      sub: 'u-1',
      organizationId: ORG,
      roles: ['viewer'],
      projectRoles: { [PROJECT]: 'viewer' },
    });
    const res = await get('me', token).expect(200);
    expect(res.body).toEqual({
      sub: 'u-1',
      actor: { sub: 'u-1', sub_type: 'user' },
      projects: [PROJECT],
    });
  });

  it('checks organization permissions and tenancy', async () => {
    const viewer = await tokens.user({
      organizationId: ORG,
      roles: ['viewer'],
    });
    await get(`organizations/${ORG}/agents`, viewer).expect(200);
    const res = await post(`organizations/${ORG}/agents`, viewer).expect(403);
    expect(res.body).toMatchObject({ code: 'FORBIDDEN' });
    await post(
      `organizations/${ORG}/agents`,
      await tokens.user({ organizationId: ORG, roles: ['admin'] }),
    ).expect(201);

    // Another organization's ID is not confirmed to exist.
    await get(`organizations/${OTHER_ORG}/agents`, viewer).expect(404);
    await get(`organizations/${ORG}/agents`, await tokens.user()).expect(404);
  });

  it('checks project permissions: invisible projects are 404, missing permissions 403', async () => {
    const path = `organizations/${ORG}/projects/${PROJECT}/tasks`;
    await post(
      path,
      await tokens.user({ organizationId: ORG, roles: ['member'] }),
    ).expect(404);
    await post(
      path,
      await tokens.user({
        organizationId: ORG,
        roles: ['member'],
        projectRoles: { [PROJECT]: 'viewer' },
      }),
    ).expect(403);
    await post(
      path,
      await tokens.user({
        organizationId: ORG,
        roles: ['member'],
        projectRoles: { [PROJECT]: 'editor' },
      }),
    ).expect(201);
    await post(
      path,
      await tokens.user({ organizationId: ORG, roles: ['admin'] }),
    ).expect(201);
  });

  it('lets platform services in only where routes allow it', async () => {
    const reader = await tokens.service('hephaestus', ['platform:read']);
    await get('organizations', reader).expect(200);
    await get(`organizations/${ORG}/agents`, reader).expect(200);
    await post(`organizations/${ORG}/agents`, reader).expect(403);
    await get('organizations', await tokens.service('kairos', [])).expect(403);
    await get(
      'organizations',
      await tokens.user({ organizationId: ORG, roles: ['owner'] }),
    ).expect(403);
  });

  it('refuses routes that declare no access rule', async () => {
    await get(
      'forgotten',
      await tokens.user({ organizationId: ORG, roles: ['owner'] }),
    ).expect(403);
  });
});
