import { Injectable } from '@nestjs/common';

import {
  OnDomainEvent,
  type DomainEvent,
  type PolisEvents,
} from '@kerykes/core';

import { MembershipsService } from './memberships.service.js';

type Payloads = PolisEvents.PolisEventPayloads;

/**
 * Polis's membership events, into Kerykes's copy of them. Only users:
 * service accounts are never told anything.
 */
@Injectable()
export class PolisMembershipsListener {
  constructor(private readonly memberships: MembershipsService) {}

  @OnDomainEvent('polis.membership.granted')
  async onGranted(event: DomainEvent<Payloads['membership.granted']>) {
    const { payload } = event;
    if (payload.principal.sub_type !== 'user') return;
    await this.memberships.applyOrganizationMembership({
      membershipId: payload.membershipId,
      organizationId: payload.scope.organizationId,
      sub: payload.principal.sub,
      roles: payload.roles,
      version: event.aggregateVersion,
    });
  }

  @OnDomainEvent('polis.membership.role-changed')
  async onRoleChanged(event: DomainEvent<Payloads['membership.role-changed']>) {
    const { payload } = event;
    if (payload.principal.sub_type !== 'user') return;
    await this.memberships.applyOrganizationMembership({
      membershipId: payload.membershipId,
      organizationId: payload.scope.organizationId,
      sub: payload.principal.sub,
      roles: payload.to,
      version: event.aggregateVersion,
    });
  }

  @OnDomainEvent('polis.membership.revoked')
  async onRevoked(event: DomainEvent<Payloads['membership.revoked']>) {
    const { payload } = event;
    if (payload.principal.sub_type !== 'user') return;
    await this.memberships.applyOrganizationMembership({
      membershipId: payload.membershipId,
      organizationId: payload.scope.organizationId,
      sub: payload.principal.sub,
      roles: null,
      version: event.aggregateVersion,
    });
  }

  @OnDomainEvent('polis.project-membership.granted')
  async onProjectGranted(
    event: DomainEvent<Payloads['project-membership.granted']>,
  ) {
    const { payload } = event;
    if (payload.principal.sub_type !== 'user') return;
    await this.memberships.applyProjectMembership({
      membershipId: payload.membershipId,
      organizationId: payload.scope.organizationId,
      projectId: payload.scope.projectId,
      sub: payload.principal.sub,
      role: payload.role,
      version: event.aggregateVersion,
    });
  }

  @OnDomainEvent('polis.project-membership.role-changed')
  async onProjectRoleChanged(
    event: DomainEvent<Payloads['project-membership.role-changed']>,
  ) {
    const { payload } = event;
    if (payload.principal.sub_type !== 'user') return;
    await this.memberships.applyProjectMembership({
      membershipId: payload.membershipId,
      organizationId: payload.scope.organizationId,
      projectId: payload.scope.projectId,
      sub: payload.principal.sub,
      role: payload.to,
      version: event.aggregateVersion,
    });
  }

  @OnDomainEvent('polis.project-membership.revoked')
  async onProjectRevoked(
    event: DomainEvent<Payloads['project-membership.revoked']>,
  ) {
    const { payload } = event;
    if (payload.principal.sub_type !== 'user') return;
    await this.memberships.applyProjectMembership({
      membershipId: payload.membershipId,
      organizationId: payload.scope.organizationId,
      projectId: payload.scope.projectId,
      sub: payload.principal.sub,
      role: null,
      version: event.aggregateVersion,
    });
  }
}
