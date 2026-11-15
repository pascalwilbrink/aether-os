import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import type { OrganizationId, WorkspaceId } from '@hephaestus/core';
import { WorkspaceService } from '@hephaestus/workspaces';

import { AppModule } from '../src/app.module.js';

let projectId: string;

function workspaceBody(overrides: Record<string, unknown> = {}) {
  return {
    projectId,
    executionId: 'execution-1',
    repository: {
      provider: 'github',
      repositoryUrl: 'https://github.com/acme/app',
      branch: 'main',
    },
    sandbox: {
      provider: 'docker',
      image: 'node:22',
      cpuLimit: 2,
      memoryLimitMb: 2048,
      networkAccess: 'restricted',
    },
    workingDirectory: '/workspace',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

describe('Workspaces (e2e)', () => {
  let app: INestApplication<App>;
  let orgId: string;
  let base: string;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const org = await request(app.getHttpServer())
      .post('/organizations')
      .send({ name: 'Acme', slug: 'acme', createdBy: 'user-1' })
      .expect(201);
    orgId = org.body.id;
    base = `/organizations/${orgId}/workspaces`;

    const project = await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects`)
      .send({ name: 'App', slug: 'app', description: '', createdBy: 'user-1' })
      .expect(201);
    projectId = project.body.id;
  });

  afterEach(async () => {
    await app.close();
  });

  async function createWorkspace(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(base)
      .send(workspaceBody())
      .expect(201);

    return res.body.id;
  }

  /** Simulates the provisioner, which has no HTTP endpoints. */
  async function provision(id: string): Promise<void> {
    const service = app.get(WorkspaceService);
    await service.startProvisioning(orgId as OrganizationId, id as WorkspaceId);
    await service.markReady(orgId as OrganizationId, id as WorkspaceId, {
      provider: 'docker',
      resourceId: 'container-123',
    });
  }

  it('creates, fetches and lists workspaces', async () => {
    const id = await createWorkspace();

    const res = await request(app.getHttpServer())
      .get(`${base}/${id}`)
      .expect(200);
    expect(res.body).toMatchObject({
      id,
      organizationId: orgId,
      status: 'requested',
      sandboxReference: null,
      repository: workspaceBody().repository,
    });
    expect(typeof res.body.expiresAt).toBe('string');
    expect(res.body).not.toHaveProperty('props');

    const list = await request(app.getHttpServer()).get(base).expect(200);
    expect(list.body).toMatchObject({ total: 1, limit: 50, offset: 0 });

    await request(app.getHttpServer()).get(`${base}/unknown`).expect(404);
  });

  it('validates the request body', async () => {
    const invalid = [
      workspaceBody({ workingDirectory: 'relative/path' }),
      workspaceBody({ expiresAt: 'not-a-date' }),
      workspaceBody({
        repository: { ...workspaceBody().repository, provider: 'svn' },
      }),
      workspaceBody({
        repository: {
          ...workspaceBody().repository,
          repositoryUrl: 'http://insecure.example',
        },
      }),
      workspaceBody({
        repository: { ...workspaceBody().repository, commitSha: 'XYZ' },
      }),
      workspaceBody({
        sandbox: { ...workspaceBody().sandbox, memoryLimitMb: -1 },
      }),
      workspaceBody({
        sandbox: { ...workspaceBody().sandbox, networkAccess: 'open' },
      }),
    ];

    for (const body of invalid) {
      await request(app.getHttpServer()).post(base).send(body).expect(400);
    }

    const past = await request(app.getHttpServer())
      .post(base)
      .send(
        workspaceBody({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
      )
      .expect(409);
    expect(past.body.error).toBe('WORKSPACE_INVALID_EXPIRY');
  });

  it('drives user actions over HTTP', async () => {
    const id = await createWorkspace();
    const server = app.getHttpServer();

    // Not provisioned yet.
    const early = await request(server)
      .post(`${base}/${id}/acquire`)
      .expect(409);
    expect(early.body.error).toBe('WORKSPACE_INVALID_TRANSITION');

    await provision(id);

    const acquired = await request(server)
      .post(`${base}/${id}/acquire`)
      .expect(200);
    expect(acquired.body.status).toBe('in_use');
    expect(acquired.body.sandboxReference).toEqual({
      provider: 'docker',
      resourceId: 'container-123',
    });

    for (const [action, status] of [
      ['release', 'ready'],
      ['suspend', 'suspended'],
      ['resume', 'ready'],
      ['destroy', 'stopping'],
    ] as const) {
      const res = await request(server)
        .post(`${base}/${id}/${action}`)
        .expect(200);
      expect(res.body.status).toBe(status);
    }
  });

  it('requires an active project', async () => {
    await request(app.getHttpServer())
      .post(base)
      .send(workspaceBody({ projectId: 'unknown' }))
      .expect(404);

    await request(app.getHttpServer())
      .post(`/organizations/${orgId}/projects/${projectId}/archive`)
      .expect(204);

    const archived = await request(app.getHttpServer())
      .post(base)
      .send(workspaceBody())
      .expect(409);
    expect(archived.body.error).toBe('PROJECT_ARCHIVED');
  });

  it('applies organization rules', async () => {
    const id = await createWorkspace();
    await provision(id);
    const server = app.getHttpServer();

    await request(server).post(`/organizations/${orgId}/suspend`).expect(200);

    const create = await request(server)
      .post(base)
      .send(workspaceBody())
      .expect(409);
    expect(create.body.error).toBe('ORGANIZATION_SUSPENDED');

    const acquire = await request(server)
      .post(`${base}/${id}/acquire`)
      .expect(409);
    expect(acquire.body.error).toBe('ORGANIZATION_SUSPENDED');

    await request(server).get(`${base}/${id}`).expect(200);
    await request(server).post(`${base}/${id}/destroy`).expect(200);

    await request(server).get('/organizations/unknown/workspaces').expect(404);
  });
});
