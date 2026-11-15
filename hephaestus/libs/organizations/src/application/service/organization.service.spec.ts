import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { OrganizationId } from '@hephaestus/core';

import { OrganizationAlreadySuspendedError } from '../../domain/error/organization-already-suspended.error.js';
import { OrganizationSlugTakenError } from '../../domain/error/organization-slug-taken.error.js';
import { OrganizationsModule } from '../../organizations.module.js';
import { OrganizationService } from './organization.service.js';

const orgId = 'org-1' as OrganizationId;

describe('OrganizationService (sqlite)', () => {
  let moduleRef: TestingModule;
  let service: OrganizationService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          autoLoadEntities: true,
          synchronize: true,
        }),
        OrganizationsModule,
      ],
    }).compile();

    service = moduleRef.get(OrganizationService);

    await service.create({
      id: orgId,
      name: 'Acme',
      slug: 'acme',
      createdBy: 'user-1',
    });
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('persists and loads an organization by id and slug', async () => {
    const byId = await service.findById(orgId);
    const bySlug = await service.findBySlug('acme');

    expect(byId).toMatchObject({
      name: 'Acme',
      slug: 'acme',
      status: 'active',
    });
    expect(bySlug.id).toBe(orgId);
    expect(byId.createdAt).toBeInstanceOf(Date);
  });

  it('404s for unknown organizations', async () => {
    await expect(
      service.findById('missing' as OrganizationId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.findBySlug('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a duplicate slug', async () => {
    await expect(
      service.create({
        id: 'org-2' as OrganizationId,
        name: 'Other Acme',
        slug: 'acme',
        createdBy: 'user-1',
      }),
    ).rejects.toBeInstanceOf(OrganizationSlugTakenError);
  });

  it('suspends and reactivates', async () => {
    await service.suspend(orgId);
    await expect(service.findById(orgId)).resolves.toMatchObject({
      status: 'suspended',
    });

    await expect(service.suspend(orgId)).rejects.toBeInstanceOf(
      OrganizationAlreadySuspendedError,
    );

    await service.activate(orgId);
    await expect(service.findById(orgId)).resolves.toMatchObject({
      status: 'active',
    });
  });

  it('lists organizations with pagination', async () => {
    await service.create({
      id: 'org-2' as OrganizationId,
      name: 'Globex',
      slug: 'globex',
      createdBy: 'user-1',
    });

    const page = await service.list({ limit: 1 });

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
  });
});
