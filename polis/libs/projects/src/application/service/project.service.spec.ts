import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { OrganizationId, ProjectId } from '@polis/core';
import {
  OrganizationService,
  OrganizationSuspendedError,
} from '@polis/organizations';

import { ProjectArchivedError } from '../../domain/error/project-archived.error.js';
import { ProjectSlugTakenError } from '../../domain/error/project-slug-taken.error.js';
import { ProjectsModule } from '../../projects.module.js';
import { ProjectService } from './project.service.js';

const orgId = 'org-1' as OrganizationId;
const otherOrgId = 'org-2' as OrganizationId;
const projectId = 'project-1' as ProjectId;

function projectInput(
  id: ProjectId = projectId,
  organizationId: OrganizationId = orgId,
  slug = 'app',
) {
  return {
    id,
    organizationId,
    name: 'App',
    slug,
    description: 'The main app',
    createdBy: 'user-1',
  };
}

describe('ProjectService (sqlite)', () => {
  let moduleRef: TestingModule;
  let service: ProjectService;
  let organizations: OrganizationService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          autoLoadEntities: true,
          synchronize: true,
        }),
        ProjectsModule,
      ],
    }).compile();

    service = moduleRef.get(ProjectService);
    organizations = moduleRef.get(OrganizationService);

    for (const [id, slug] of [
      [orgId, 'org-one'],
      [otherOrgId, 'org-two'],
    ] as const) {
      await organizations.create({ id, name: slug, slug, createdBy: 'user-1' });
    }

    await service.create(projectInput());
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('persists and loads a project', async () => {
    const project = await service.findById(orgId, projectId);

    expect(project).toMatchObject({
      name: 'App',
      slug: 'app',
      description: 'The main app',
      status: 'active',
    });
    expect(project.createdAt).toBeInstanceOf(Date);
  });

  it('scopes lookups to the organization', async () => {
    await expect(
      service.findById(otherOrgId, projectId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enforces unique slugs per organization only', async () => {
    await expect(
      service.create(projectInput('project-2' as ProjectId)),
    ).rejects.toBeInstanceOf(ProjectSlugTakenError);

    // Same slug in another organization is fine.
    await expect(
      service.create(projectInput('project-2' as ProjectId, otherOrgId)),
    ).resolves.toMatchObject({ slug: 'app' });
  });

  it('archives once, then blocks findActiveById', async () => {
    await expect(
      service.findActiveById(orgId, projectId),
    ).resolves.toBeDefined();

    await service.archive(orgId, projectId);

    expect((await service.findById(orgId, projectId)).status).toBe('archived');
    await expect(service.archive(orgId, projectId)).rejects.toBeInstanceOf(
      ProjectArchivedError,
    );
    await expect(
      service.findActiveById(orgId, projectId),
    ).rejects.toBeInstanceOf(ProjectArchivedError);
  });

  it('applies organization rules', async () => {
    await organizations.suspend(orgId);

    await expect(
      service.create(projectInput('project-2' as ProjectId, orgId, 'other')),
    ).rejects.toBeInstanceOf(OrganizationSuspendedError);
    await expect(
      service.findActiveById(orgId, projectId),
    ).rejects.toBeInstanceOf(OrganizationSuspendedError);
    await expect(service.archive(orgId, projectId)).rejects.toBeInstanceOf(
      OrganizationSuspendedError,
    );

    await expect(service.findById(orgId, projectId)).resolves.toBeDefined();

    await expect(
      service.list('missing' as OrganizationId, { limit: 10 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists projects per organization', async () => {
    await service.create(
      projectInput('project-2' as ProjectId, orgId, 'other'),
    );
    await service.create(projectInput('project-3' as ProjectId, otherOrgId));

    const page = await service.list(orgId, { limit: 10 });

    expect(page.nextCursor).toBeNull();
    expect(page.items.map((p) => p.id).sort()).toEqual([
      'project-1',
      'project-2',
    ]);
  });
});
