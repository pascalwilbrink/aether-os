import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

import { createTestingModule } from '../../../test/testing-module.js';
import { OrganizationsModule } from './organizations.module.js';
import { OrganizationsService } from './organizations.service.js';

const missing = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

describe('OrganizationsService (Postgres)', () => {
  let moduleRef: TestingModule;
  let service: OrganizationsService;

  beforeEach(async () => {
    moduleRef = await createTestingModule(OrganizationsModule);
    service = moduleRef.get(OrganizationsService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  const create = (slug = 'acme') =>
    service.create({ name: 'Acme', slug, createdBy: 'user-1' });

  it('creates and finds an organization by ID and slug', async () => {
    const created = await create();

    await expect(service.findById(created.id)).resolves.toEqual(created);
    await expect(service.findBySlug('acme')).resolves.toEqual(created);
    await expect(service.findById(missing)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.findBySlug('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a slug that is taken', async () => {
    await create();

    await expect(create()).rejects.toMatchObject({
      code: 'ORGANIZATION_SLUG_TAKEN',
    });
  });

  it('suspends and activates idempotently', async () => {
    const { id, updatedAt } = await create();

    const suspended = await service.suspend(id);
    expect(suspended.status).toBe('suspended');
    expect(suspended.updatedAt > updatedAt).toBe(true);

    await expect(service.suspend(id)).resolves.toEqual(suspended);
    await expect(service.assertAcceptsWrites(id)).rejects.toMatchObject({
      code: 'ORGANIZATION_SUSPENDED',
    });

    await expect(service.activate(id)).resolves.toMatchObject({
      status: 'active',
    });
    await expect(service.assertAcceptsWrites(id)).resolves.toBeUndefined();
    await expect(service.suspend(missing)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists newest first, page by page', async () => {
    const created = [];
    for (const slug of ['one', 'two', 'three']) {
      created.push(await create(slug));
    }

    const first = await service.list({ limit: 2 });
    const second = await service.list({ limit: 2, cursor: first.nextCursor });

    expect([...first.items, ...second.items].map((o) => o.slug)).toEqual([
      'three',
      'two',
      'one',
    ]);
    expect(second.nextCursor).toBeNull();
  });
});
