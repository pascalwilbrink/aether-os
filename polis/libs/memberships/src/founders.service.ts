import { Injectable } from '@nestjs/common';

import type { DomainEvent, PolisEventPayloads } from '@polis/core';
import { OnDomainEvent } from '@polis/core';

import { MembershipsService } from './memberships.service.js';

/**
 * The person who creates an organization becomes its first owner, in the
 * same transaction (the local `organization.created` event is handled
 * before it commits). Organizations created by platform services have no
 * owner until one is granted.
 */
@Injectable()
export class FoundersService {
  constructor(private readonly memberships: MembershipsService) {}

  @OnDomainEvent('polis.organization.created')
  async onOrganizationCreated(
    event: DomainEvent<PolisEventPayloads['organization.created']>,
  ): Promise<void> {
    if (event.actor?.sub_type === 'user') {
      await this.memberships.grantFounder(
        event.organizationId!,
        event.actor.sub,
      );
    }
  }
}
