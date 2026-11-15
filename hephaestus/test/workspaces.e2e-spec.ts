import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';

import { WorkspacesService } from '@hephaestus/workspaces';

import { createApp, MISSING_ID } from './app.js';
import { asMember, type Client } from './auth.js';
import {
  organizationEvent,
  projectArchived,
  type FakePolis,
} from './fake-polis.js';

describe('Workspaces (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let orgId: string;
  let projectId: string;
  let base: string;
  let owner: Client;

  beforeEach(async () => {
    ({ app, polis } = await createApp());
    orgId = polis.organization();
    base = `/v1/organizations/${orgId}/workspaces`;
    projectId = polis.project(orgId);
    owner = await asMember(app, orgId, ['owner']);
  });

  afterEach(async () => {
    await app.close();
  });

  // The organization's owner: project admin everywhere.
  const http = () => owner;

  const body = (overrides: Record<string, unknown> = {}) => ({
    projectId,
    executionId: '0193a1b2-c3d4-7e5f-8a9b-0000000000e1',
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
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  });

  it('creates, fetches and lists workspaces', async () => {
    const created = await http().post(base).send(body()).expect(201);
    expect(created.body).toMatchObject({
      organizationId: orgId,
      projectId,
      status: 'requested',
      sandboxReference: null,
      startedAt: null,
    });

    await http().get(`${base}/${created.body.id}`).expect(200);
    const list = await http().get(base).expect(200);
    expect(list.body).toMatchObject({ nextCursor: null });
    expect(list.body.items).toHaveLength(1);

    await http().get(`${base}/${MISSING_ID}`).expect(404);
  });

  it('validates the request body', async () => {
    const cases: Record<string, unknown>[] = [
      {
        repository: {
          provider: 'svn',
          repositoryUrl: 'https://x',
          branch: 'main',
        },
      },
      {
        repository: {
          provider: 'github',
          repositoryUrl: 'http://x.example',
          branch: 'main',
        },
      },
      { sandbox: { ...body().sandbox, cpuLimit: 0 } },
      { workingDirectory: 'relative/path' },
      { projectId: 'not-a-uuid' },
    ];
    for (const overrides of cases) {
      await http().post(base).send(body(overrides)).expect(400);
    }

    const past = await http()
      .post(base)
      .send(body({ expiresAt: new Date(Date.now() - 1000).toISOString() }))
      .expect(409);
    expect(past.body.code).toBe('WORKSPACE_INVALID_EXPIRY');
  });

  it('drives the user actions over HTTP', async () => {
    const { body: workspace } = await http()
      .post(base)
      .send(body())
      .expect(201);
    const url = `${base}/${workspace.id}`;

    const early = await http().post(`${url}/acquire`).expect(409);
    expect(early.body.code).toBe('WORKSPACE_INVALID_TRANSITION');

    // The provisioner (not HTTP) makes it ready.
    const service = app.get(WorkspacesService);
    await service.startProvisioning(orgId, workspace.id);
    await service.markReady(orgId, workspace.id, {
      provider: 'docker',
      resourceId: 'c1',
    });

    for (const [action, status] of [
      ['acquire', 'in_use'],
      ['release', 'ready'],
      ['suspend', 'suspended'],
      ['resume', 'ready'],
      ['destroy', 'stopping'],
    ] as const) {
      const res = await http().post(`${url}/${action}`).expect(200);
      expect(res.body.status).toBe(status);
    }
  });

  it('requires an active project and organization', async () => {
    await projectArchived(app, orgId, projectId, 2);
    const archived = await http().post(base).send(body()).expect(409);
    expect(archived.body.code).toBe('PROJECT_ARCHIVED');

    await organizationEvent(app, orgId, 'organization.suspended', 2);
    const suspended = await http().post(base).send(body()).expect(409);
    expect(suspended.body.code).toBe('ORGANIZATION_SUSPENDED');
  });

  it("needs a role in the workspace's project", async () => {
    const created = await http().post(base).send(body()).expect(201);
    const url = `${base}/${created.body.id}`;

    // A member without a project role sees no workspaces.
    const outsider = await asMember(app, orgId, ['member']);
    await outsider.get(base).expect(200, { items: [], nextCursor: null });
    await outsider.get(url).expect(404);
    await outsider.post(base).send(body()).expect(404);

    // Viewers read; editors run work.
    const viewer = await asMember(app, orgId, ['member'], {
      [projectId]: 'viewer',
    });
    await viewer.get(url).expect(200);
    const visible = await viewer.get(base).expect(200);
    expect(visible.body.items).toHaveLength(1);
    await viewer.post(`${url}/acquire`).expect(403);

    const editor = await asMember(app, orgId, ['member'], {
      [projectId]: 'editor',
    });
    await editor.post(base).send(body()).expect(201);
  });
});
