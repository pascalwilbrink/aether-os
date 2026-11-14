import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';

import type {
  ExecutionId,
  OrganizationId,
  ProjectId,
  WorkspaceId,
} from '@hephaestus/core';
import {
  OrganizationService,
  OrganizationSuspendedError,
} from '@hephaestus/organizations';
import { ProjectArchivedError, ProjectService } from '@hephaestus/projects';

import { InvalidWorkspaceExpiryError } from '../../domain/error/invalid-workspace-expiry.error.js';
import { InvalidWorkspaceTransitionError } from '../../domain/error/invalid-workspace-transition.error.js';
import { WorkspacesModule } from '../../workspaces.module.js';
import { WorkspaceService } from './workspace.service.js';

const orgId = 'org-1' as OrganizationId;
const otherOrgId = 'org-2' as OrganizationId;
const workspaceId = 'ws-1' as WorkspaceId;
const projectId = 'project-1' as ProjectId;
const otherProjectId = 'project-2' as ProjectId;
const reference = { provider: 'docker', resourceId: 'container-123' };

function workspaceInput(
  id = workspaceId,
  organizationId = orgId,
  project = projectId,
) {
  return {
    id,
    organizationId,
    projectId: project,
    executionId: 'execution-1' as ExecutionId,
    repository: {
      provider: 'github' as const,
      repositoryUrl: 'https://github.com/acme/app',
      branch: 'main',
      commitSha: 'abc1234',
    },
    sandbox: {
      provider: 'docker',
      image: 'node:22',
      cpuLimit: 2,
      memoryLimitMb: 2048,
      networkAccess: 'restricted' as const,
    },
    workingDirectory: '/workspace',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };
}

describe('WorkspaceService (sqlite)', () => {
  let moduleRef: TestingModule;
  let service: WorkspaceService;
  let organizations: OrganizationService;
  let projects: ProjectService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          autoLoadEntities: true,
          synchronize: true,
        }),
        WorkspacesModule,
      ],
    }).compile();

    service = moduleRef.get(WorkspaceService);
    organizations = moduleRef.get(OrganizationService);
    projects = moduleRef.get(ProjectService);

    for (const [id, slug] of [
      [orgId, 'org-one'],
      [otherOrgId, 'org-two'],
    ] as const) {
      await organizations.create({ id, name: slug, slug, createdBy: 'user-1' });
    }

    for (const [id, organizationId] of [
      [projectId, orgId],
      [otherProjectId, otherOrgId],
    ] as const) {
      await projects.create({
        id,
        organizationId,
        name: 'App',
        slug: 'app',
        description: '',
        createdBy: 'user-1',
      });
    }

    await service.create(workspaceInput());
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  async function provision(): Promise<void> {
    await service.startProvisioning(orgId, workspaceId);
    await service.markReady(orgId, workspaceId, reference);
  }

  it('persists and round-trips a workspace', async () => {
    const workspace = await service.findById(orgId, workspaceId);

    expect(workspace.status).toBe('requested');
    expect(workspace.repository).toEqual(workspaceInput().repository);
    expect(workspace.sandbox).toEqual(workspaceInput().sandbox);
    expect(workspace.sandboxReference).toBeNull();
    expect(workspace.expiresAt).toBeInstanceOf(Date);
    expect(workspace.startedAt).toBeNull();
  });

  it('scopes lookups to the organization', async () => {
    await expect(
      service.findById(otherOrgId, workspaceId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an expiry in the past', async () => {
    await expect(
      service.create({
        ...workspaceInput('ws-2' as WorkspaceId),
        expiresAt: new Date(Date.now() - 1000),
      }),
    ).rejects.toBeInstanceOf(InvalidWorkspaceExpiryError);
  });

  it('runs the full lifecycle', async () => {
    await provision();

    let workspace = await service.findById(orgId, workspaceId);
    expect(workspace.status).toBe('ready');
    expect(workspace.sandboxReference).toEqual(reference);

    await service.acquire(orgId, workspaceId);
    workspace = await service.findById(orgId, workspaceId);
    expect(workspace.status).toBe('in_use');
    expect(workspace.startedAt).toBeInstanceOf(Date);

    await service.release(orgId, workspaceId);
    await service.suspend(orgId, workspaceId);
    await service.resume(orgId, workspaceId);
    await service.destroy(orgId, workspaceId);
    expect((await service.findById(orgId, workspaceId)).status).toBe('stopping');

    await service.markDestroyed(orgId, workspaceId);
    workspace = await service.findById(orgId, workspaceId);
    expect(workspace.status).toBe('destroyed');
    expect(workspace.sandboxReference).toBeNull();
    expect(workspace.destroyedAt).toBeInstanceOf(Date);
  });

  it('rejects invalid transitions', async () => {
    await expect(
      service.acquire(orgId, workspaceId),
    ).rejects.toBeInstanceOf(InvalidWorkspaceTransitionError);

    await expect(
      service.destroy(orgId, workspaceId),
    ).rejects.toBeInstanceOf(InvalidWorkspaceTransitionError);

    // Nothing was persisted by the failed attempts.
    expect((await service.findById(orgId, workspaceId)).status).toBe('requested');
  });

  it('records failures and allows destroying failed workspaces', async () => {
    await service.startProvisioning(orgId, workspaceId);
    await service.markFailed(orgId, workspaceId, 'image pull failed');

    const failed = await service.findById(orgId, workspaceId);
    expect(failed.status).toBe('failed');
    expect(failed.failureReason).toBe('image pull failed');

    await service.destroy(orgId, workspaceId);
    expect((await service.findById(orgId, workspaceId)).status).toBe('stopping');
  });

  it('expires, and cannot expire twice', async () => {
    await service.expire(orgId, workspaceId);
    expect((await service.findById(orgId, workspaceId)).status).toBe('expired');

    await expect(
      service.expire(orgId, workspaceId),
    ).rejects.toBeInstanceOf(InvalidWorkspaceTransitionError);
  });

  it('requires an active project in the same organization', async () => {
    await expect(
      service.create(
        workspaceInput('ws-2' as WorkspaceId, orgId, 'missing' as ProjectId),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    // A project from another organization is not visible.
    await expect(
      service.create(workspaceInput('ws-2' as WorkspaceId, orgId, otherProjectId)),
    ).rejects.toBeInstanceOf(NotFoundException);

    await projects.archive(orgId, projectId);

    await expect(
      service.create(workspaceInput('ws-2' as WorkspaceId)),
    ).rejects.toBeInstanceOf(ProjectArchivedError);

    // Existing workspaces of an archived project keep working.
    await provision();
    await service.acquire(orgId, workspaceId);
  });

  it('applies organization rules', async () => {
    await provision();
    await organizations.suspend(orgId);

    await expect(
      service.create(workspaceInput('ws-2' as WorkspaceId)),
    ).rejects.toBeInstanceOf(OrganizationSuspendedError);
    await expect(
      service.acquire(orgId, workspaceId),
    ).rejects.toBeInstanceOf(OrganizationSuspendedError);

    // Reads, destroy and provisioner callbacks still work.
    await expect(service.findById(orgId, workspaceId)).resolves.toBeDefined();
    await service.destroy(orgId, workspaceId);
    await service.markDestroyed(orgId, workspaceId);
    expect((await service.findById(orgId, workspaceId)).status).toBe('destroyed');

    await expect(
      service.list('missing' as OrganizationId, { limit: 10, offset: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists workspaces per organization', async () => {
    await service.create(workspaceInput('ws-2' as WorkspaceId));
    await service.create(
      workspaceInput('ws-3' as WorkspaceId, otherOrgId, otherProjectId),
    );

    const page = await service.list(orgId, { limit: 10, offset: 0 });

    expect(page.total).toBe(2);
    expect(page.items.map((w) => w.id).sort()).toEqual(['ws-1', 'ws-2']);
  });
});
