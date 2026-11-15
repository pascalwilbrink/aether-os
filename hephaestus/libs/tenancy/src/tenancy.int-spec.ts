import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';

import { EventInbox } from '@hephaestus/core';

import {
  deliverPolisEvent,
  organizationEvent,
  projectArchived,
  type FakePolis,
} from '../../../test/fake-polis.js';
import { createTestingModule } from '../../../test/testing-module.js';
import { OrganizationsService } from './organizations.service.js';
import { ProjectsService } from './projects.service.js';
import { TenancyModule } from './tenancy.module.js';

const missing = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

describe('Tenancy from Polis (Postgres)', () => {
  let moduleRef: TestingModule;
  let polis: FakePolis;
  let organizations: OrganizationsService;
  let projects: ProjectsService;

  beforeEach(async () => {
    ({ moduleRef, polis } = await createTestingModule(TenancyModule));
    organizations = moduleRef.get(OrganizationsService);
    projects = moduleRef.get(ProjectsService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('asks Polis once about an organization it has not seen, then keeps it', async () => {
    const orgId = polis.organization();

    await organizations.assertAcceptsWrites(orgId);
    await organizations.assertExists(orgId);

    expect(polis.calls).toBe(1);
    await expect(organizations.assertExists(missing)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('follows Polis events, ignoring old and repeated ones', async () => {
    const orgId = polis.organization();
    await organizationEvent(moduleRef, orgId, 'organization.created', 1);

    await organizationEvent(moduleRef, orgId, 'organization.suspended', 2);
    await expect(
      organizations.assertAcceptsWrites(orgId),
    ).rejects.toMatchObject({
      code: 'ORGANIZATION_SUSPENDED',
    });
    await organizations.assertExists(orgId); // reads still work

    // A late event from before the suspension changes nothing.
    await organizationEvent(moduleRef, orgId, 'organization.reactivated', 1);
    await expect(
      organizations.assertAcceptsWrites(orgId),
    ).rejects.toMatchObject({
      code: 'ORGANIZATION_SUSPENDED',
    });

    await organizationEvent(moduleRef, orgId, 'organization.reactivated', 3);
    await organizations.assertAcceptsWrites(orgId);
    expect(polis.calls).toBe(0); // the events were enough
  });

  it('never lets a late event undo a fresher fetched state', async () => {
    const orgId = polis.organization('suspended', 2);
    await expect(
      organizations.assertAcceptsWrites(orgId),
    ).rejects.toMatchObject({
      code: 'ORGANIZATION_SUSPENDED',
    });

    await organizationEvent(moduleRef, orgId, 'organization.created', 1);
    await expect(
      organizations.assertAcceptsWrites(orgId),
    ).rejects.toMatchObject({
      code: 'ORGANIZATION_SUSPENDED',
    });
  });

  it('handles each event once', async () => {
    const orgId = polis.organization();
    const event = {
      eventType: 'organization.suspended',
      aggregateId: orgId,
      aggregateVersion: 2,
      organizationId: orgId,
      payload: { organizationId: orgId, reason: null },
    };

    await expect(deliverPolisEvent(moduleRef, event)).resolves.toBe(true);
    // deliverPolisEvent makes a new eventId each time; replay one instead:
    const inbox = moduleRef.get(EventInbox);
    const envelope = {
      ...event,
      eventId: '0193a1b2-c3d4-7e5f-8a9b-00000000e001',
      schemaVersion: 1,
      occurredAt: new Date(),
      projectId: null,
      actor: null,
    };
    await expect(inbox.receive('polis', envelope)).resolves.toBe(true);
    await expect(inbox.receive('polis', envelope)).resolves.toBe(false);
  });

  it('answers 503 when Polis is needed but unreachable', async () => {
    const known = polis.organization();
    await organizations.assertExists(known);
    polis.unavailable = true;

    await organizations.assertExists(known); // already known: no call
    await expect(
      organizations.assertExists(polis.organization()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('checks projects: in the organization, and active', async () => {
    const orgId = polis.organization();
    const otherOrg = polis.organization();
    const projectId = polis.project(orgId);

    await projects.assertAcceptsWrites(orgId, projectId);
    await expect(
      projects.assertAcceptsWrites(otherOrg, projectId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      projects.assertAcceptsWrites(orgId, missing),
    ).rejects.toBeInstanceOf(NotFoundException);

    await projectArchived(moduleRef, orgId, projectId, 2);
    await expect(
      projects.assertAcceptsWrites(orgId, projectId),
    ).rejects.toMatchObject({
      code: 'PROJECT_ARCHIVED',
    });

    await organizationEvent(moduleRef, orgId, 'organization.suspended', 2);
    await expect(
      projects.assertAcceptsWrites(orgId, polis.project(orgId)),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_SUSPENDED' });
  });
});
