import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

import { OrganizationsService } from '@hephaestus/organizations';
import { ProjectsService } from '@hephaestus/projects';

import { createTestingModule } from '../../../test/testing-module.js';
import { WorkspacesModule } from './workspaces.module.js';
import { WorkspacesService } from './workspaces.service.js';

const missing = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const executionId = '0193a1b2-c3d4-7e5f-8a9b-0000000000e1';
const reference = { provider: 'docker', resourceId: 'container-1' };

describe('WorkspacesService (Postgres)', () => {
  let moduleRef: TestingModule;
  let workspaces: WorkspacesService;
  let organizations: OrganizationsService;
  let projects: ProjectsService;
  let orgId: string;
  let projectId: string;

  beforeEach(async () => {
    moduleRef = await createTestingModule(WorkspacesModule);
    workspaces = moduleRef.get(WorkspacesService);
    organizations = moduleRef.get(OrganizationsService);
    projects = moduleRef.get(ProjectsService);
    orgId = (
      await organizations.create({
        name: 'Acme',
        slug: 'acme',
        createdBy: 'user-1',
      })
    ).id;
    projectId = (
      await projects.create(orgId, {
        name: 'App',
        slug: 'app',
        description: '',
        createdBy: 'user-1',
      })
    ).id;
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  const create = (overrides: Record<string, unknown> = {}) =>
    workspaces.create(orgId, {
      projectId,
      executionId,
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

  it('runs the full lifecycle, with provisioner callbacks', async () => {
    const { id } = await create();

    await workspaces.startProvisioning(orgId, id);
    const ready = await workspaces.markReady(orgId, id, reference);
    expect(ready).toMatchObject({
      status: 'ready',
      sandboxReference: reference,
    });

    const inUse = await workspaces.acquire(orgId, id);
    expect(inUse.startedAt).not.toBeNull();
    await workspaces.release(orgId, id);
    await workspaces.suspend(orgId, id);
    await workspaces.resume(orgId, id);
    await workspaces.destroy(orgId, id);

    const destroyed = await workspaces.markDestroyed(orgId, id);
    expect(destroyed).toMatchObject({
      status: 'destroyed',
      sandboxReference: null,
      destroyedAt: expect.any(String),
    });
  });

  it('rejects transitions the lifecycle does not allow', async () => {
    const { id } = await create();

    await expect(workspaces.acquire(orgId, id)).rejects.toMatchObject({
      code: 'WORKSPACE_INVALID_TRANSITION',
    });
    await workspaces.markFailed(orgId, id, 'image pull failed');
    await expect(workspaces.findById(orgId, id)).resolves.toMatchObject({
      status: 'failed',
      failureReason: 'image pull failed',
    });
    await workspaces.destroy(orgId, id);
    await expect(workspaces.expire(orgId, id)).rejects.toMatchObject({
      code: 'WORKSPACE_INVALID_TRANSITION',
    });
  });

  it('needs a future expiry and an active project in the organization', async () => {
    await expect(
      create({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_INVALID_EXPIRY' });
    await expect(create({ projectId: missing })).rejects.toBeInstanceOf(
      NotFoundException,
    );

    await projects.archive(orgId, projectId);
    await expect(create()).rejects.toMatchObject({ code: 'PROJECT_ARCHIVED' });
  });

  it('keeps destroy and callbacks available for a suspended organization', async () => {
    const { id } = await create();
    await workspaces.startProvisioning(orgId, id);
    await workspaces.markReady(orgId, id, reference);
    await organizations.suspend(orgId);

    await expect(create()).rejects.toMatchObject({
      code: 'ORGANIZATION_SUSPENDED',
    });
    await expect(workspaces.acquire(orgId, id)).rejects.toMatchObject({
      code: 'ORGANIZATION_SUSPENDED',
    });
    await workspaces.destroy(orgId, id);
    await expect(workspaces.markDestroyed(orgId, id)).resolves.toMatchObject({
      status: 'destroyed',
    });
  });

  it('lists workspaces of the organization only', async () => {
    await create();
    await create();
    const other = await organizations.create({
      name: 'Globex',
      slug: 'globex',
      createdBy: 'user-1',
    });

    await expect(workspaces.list(orgId, { limit: 10 })).resolves.toMatchObject({
      items: [expect.anything(), expect.anything()],
      nextCursor: null,
    });
    await expect(workspaces.list(other.id, { limit: 10 })).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });
});
