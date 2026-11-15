import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

import { actingAs, testPrincipal } from '@aether-os/krepis/testing';
import { outboxEvents } from '../../../test/outbox.js';
import { createTestingModule } from '../../../test/testing-module.js';
import { OrganizationsModule } from './organizations.module.js';
import { OrganizationsService } from './organizations.service.js';

const caller = testPrincipal({ sub: 'user-1' });
const missing = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

describe('OrganizationsService (Postgres)', () => {
  let moduleRef: TestingModule;
  let service: OrganizationsService;

  beforeEach(async () => {
    moduleRef = await createTestingModule(OrganizationsModule);
    service = actingAs(moduleRef.get(OrganizationsService), caller);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  const create = (slug = 'acme') => service.create({ name: 'Acme', slug });

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

  it('stores an event for every change, and none for repeated actions', async () => {
    const { id } = await create();
    await service.suspend(id);
    await service.suspend(id);
    await service.activate(id);
    await service.activate(id);

    const events = await outboxEvents(moduleRef);
    expect(
      events.map((e) => [e.eventType, e.aggregateVersion, e.organizationId]),
    ).toEqual([
      ['organization.created', 1, id],
      ['organization.suspended', 2, id],
      ['organization.reactivated', 3, id],
    ]);
    expect(events[0].payload).toEqual({ organizationId: id, slug: 'acme' });
    expect(events[1].payload).toEqual({ organizationId: id, reason: null });
  });

  it('stores no event when creating fails', async () => {
    await create();
    await expect(create()).rejects.toMatchObject({
      code: 'ORGANIZATION_SLUG_TAKEN',
    });

    expect((await outboxEvents(moduleRef)).map((e) => e.eventType)).toEqual([
      'organization.created',
    ]);
  });
});
