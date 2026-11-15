import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { OrganizationsService } from '@hephaestus/organizations';

import { createTestingModule } from '../../../test/testing-module.js';
import { ProjectsModule } from './projects.module.js';
import { ProjectsService } from './projects.service.js';

const missing = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

describe('ProjectsService (Postgres)', () => {
  let moduleRef: TestingModule;
  let projects: ProjectsService;
  let organizations: OrganizationsService;
  let orgId: string;

  beforeEach(async () => {
    moduleRef = await createTestingModule(ProjectsModule);
    projects = moduleRef.get(ProjectsService);
    organizations = moduleRef.get(OrganizationsService);
    orgId = (
      await organizations.create({
        name: 'Acme',
        slug: 'acme',
        createdBy: 'user-1',
      })
    ).id;
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  const create = (organizationId = orgId, slug = 'app') =>
    projects.create(organizationId, {
      name: 'App',
      slug,
      description: 'The main app',
      createdBy: 'user-1',
    });

  it('creates and finds a project, scoped to its organization', async () => {
    const project = await create();
    const other = await organizations.create({
      name: 'Globex',
      slug: 'globex',
      createdBy: 'user-1',
    });

    await expect(projects.findById(orgId, project.id)).resolves.toEqual(
      project,
    );
    await expect(
      projects.findById(other.id, project.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(projects.findById(missing, project.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(create(missing)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps slugs unique per organization only', async () => {
    await create();
    const other = await organizations.create({
      name: 'Globex',
      slug: 'globex',
      createdBy: 'user-1',
    });

    await expect(create()).rejects.toMatchObject({
      code: 'PROJECT_SLUG_TAKEN',
    });
    await expect(create(other.id)).resolves.toMatchObject({ slug: 'app' });
  });

  it('rolls back a failed create', async () => {
    await create();
    await expect(create()).rejects.toMatchObject({
      code: 'PROJECT_SLUG_TAKEN',
    });

    const [{ count }] = await moduleRef
      .get(DataSource)
      .query('SELECT count(*)::int AS count FROM projects');
    expect(count).toBe(1);
  });

  it('archives idempotently', async () => {
    const project = await create();

    const archived = await projects.archive(orgId, project.id);
    expect(archived.status).toBe('archived');
    await expect(projects.archive(orgId, project.id)).resolves.toEqual(
      archived,
    );
  });

  it('blocks writes, but not reads, while the organization is suspended', async () => {
    const project = await create();
    await organizations.suspend(orgId);

    await expect(create(orgId, 'other')).rejects.toMatchObject({
      code: 'ORGANIZATION_SUSPENDED',
    });
    await expect(projects.archive(orgId, project.id)).rejects.toMatchObject({
      code: 'ORGANIZATION_SUSPENDED',
    });
    await expect(projects.findById(orgId, project.id)).resolves.toMatchObject({
      status: 'active',
    });
    await expect(projects.list(orgId, { limit: 10 })).resolves.toMatchObject({
      items: [{ id: project.id }],
    });
  });
});
