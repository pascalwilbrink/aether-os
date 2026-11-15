import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

import { OrganizationsService } from '@polis/organizations';

import { outboxEvents } from '../../../test/outbox.js';
import { createTestingModule } from '../../../test/testing-module.js';
import { MembershipsModule } from './memberships.module.js';
import { MembershipsService } from './memberships.service.js';

const missing = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

describe('MembershipsService (Postgres)', () => {
  let moduleRef: TestingModule;
  let memberships: MembershipsService;
  let organizations: OrganizationsService;
  let orgId: string;

  const createOrg = async (slug: string) =>
    (await organizations.create({ name: slug, slug, createdBy: 'user-0' })).id;

  beforeEach(async () => {
    moduleRef = await createTestingModule(MembershipsModule);
    memberships = moduleRef.get(MembershipsService);
    organizations = moduleRef.get(OrganizationsService);
    orgId = await createOrg('acme');
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  const add = (
    organizationId = orgId,
    subject = 'user-1',
    roles = ['member' as const],
  ) =>
    memberships.create(organizationId, {
      subjectType: 'user',
      subject,
      roles,
      createdBy: 'user-0',
    });

  it('adds a principal once per organization, with several roles', async () => {
    const membership = await add(orgId, 'user-1', ['viewer', 'admin']);

    expect(membership.roles).toEqual(['admin', 'viewer']);
    await expect(memberships.findById(orgId, membership.id)).resolves.toEqual(
      membership,
    );
    await expect(add()).rejects.toMatchObject({ code: 'MEMBERSHIP_EXISTS' });

    // The same subject as a service account is a different principal.
    await expect(
      memberships.create(orgId, {
        subjectType: 'service_account',
        subject: 'user-1',
        roles: ['viewer'],
        createdBy: 'user-0',
      }),
    ).resolves.toMatchObject({ subjectType: 'service_account' });
  });

  it('replaces roles and removes memberships', async () => {
    const membership = await add();

    const updated = await memberships.update(orgId, membership.id, {
      roles: ['owner'],
    });
    expect(updated.roles).toEqual(['owner']);
    expect(updated.updatedAt > membership.updatedAt).toBe(true);

    await memberships.delete(orgId, membership.id);
    await expect(
      memberships.findById(orgId, membership.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      memberships.delete(orgId, membership.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('scopes memberships to their organization', async () => {
    const membership = await add();
    const other = await createOrg('globex');

    await expect(
      memberships.findById(other, membership.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      memberships.update(other, membership.id, { roles: ['owner'] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(add(missing)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lists an organization's members and a subject's organizations", async () => {
    const globex = await createOrg('globex');
    await add(orgId, 'user-1');
    await add(orgId, 'user-2');
    await add(globex, 'user-1', ['owner']);

    const acme = await memberships.list(orgId, { limit: 10 });
    expect(acme.items.map((m) => m.subject).sort()).toEqual([
      'user-1',
      'user-2',
    ]);

    const first = await memberships.listOfSubject('user', 'user-1', {
      limit: 1,
    });
    const rest = await memberships.listOfSubject('user', 'user-1', {
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(
      [...first.items, ...rest.items].map((m) => [m.organizationId, m.roles]),
    ).toEqual([
      [globex, ['owner']],
      [orgId, ['member']],
    ]);
    expect(rest.nextCursor).toBeNull();
    await expect(
      memberships.listOfSubject('service_account', 'user-1', { limit: 10 }),
    ).resolves.toEqual({ items: [], nextCursor: null });
  });

  it('blocks changes, but not reads, while the organization is suspended', async () => {
    const membership = await add();
    await organizations.suspend(orgId);

    for (const write of [
      () => add(orgId, 'user-2'),
      () => memberships.update(orgId, membership.id, { roles: ['owner'] }),
      () => memberships.delete(orgId, membership.id),
    ]) {
      await expect(write()).rejects.toMatchObject({
        code: 'ORGANIZATION_SUSPENDED',
      });
    }
    await expect(memberships.findById(orgId, membership.id)).resolves.toEqual(
      membership,
    );
  });

  it('stores granted, role-changed and revoked events', async () => {
    const membership = await add(orgId, 'user-1', ['member']);
    await memberships.update(orgId, membership.id, { roles: ['member'] });
    await memberships.update(orgId, membership.id, {
      roles: ['admin', 'member'],
    });
    await memberships.delete(orgId, membership.id);

    const base = {
      membershipId: membership.id,
      principal: { sub: 'user-1', sub_type: 'user' },
      scope: { type: 'organization', organizationId: orgId },
    };
    const events = (await outboxEvents(moduleRef)).filter((e) =>
      e.eventType.startsWith('membership.'),
    );
    expect(
      events.map((e) => [e.eventType, e.aggregateVersion, e.payload]),
    ).toEqual([
      ['membership.granted', 1, { ...base, roles: ['member'] }],
      [
        'membership.role-changed',
        2,
        { ...base, from: ['member'], to: ['admin', 'member'] },
      ],
      ['membership.revoked', 3, base],
    ]);
    expect(events.every((e) => e.organizationId === orgId)).toBe(true);
  });

  it('keeps the version when PUT changes nothing', async () => {
    const membership = await add(orgId, 'user-1', ['member', 'viewer']);

    await expect(
      memberships.update(orgId, membership.id, { roles: ['viewer', 'member'] }),
    ).resolves.toEqual(membership);
  });
});
