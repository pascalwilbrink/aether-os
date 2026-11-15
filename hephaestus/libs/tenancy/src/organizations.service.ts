import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  OnDomainEvent,
  Transactional,
  type DomainEvent,
  type PolisEvents,
} from '@hephaestus/core';

import { OrganizationStateEntity } from './organization-state.entity.js';
import { PolisClient, type OrganizationState } from './polis-client.js';
import { OrganizationSuspendedError } from './tenancy.errors.js';

/**
 * Organizations as Hephaestus sees them: Polis owns them; Hephaestus keeps
 * their status from Polis's events and asks Polis about one it hasn't seen.
 */
@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(OrganizationStateEntity)
    private readonly states: Repository<OrganizationStateEntity>,
    private readonly polis: PolisClient,
  ) {}

  /** For reads of an organization's resources: 404 unless it exists. */
  async assertExists(organizationId: string): Promise<void> {
    await this.load(organizationId);
  }

  /**
   * For writes to an organization's resources: 404 unless it exists,
   * `ORGANIZATION_SUSPENDED` unless it's active.
   */
  async assertAcceptsWrites(organizationId: string): Promise<void> {
    const state = await this.load(organizationId);
    if (state.status !== 'active') {
      throw new OrganizationSuspendedError(organizationId);
    }
  }

  @OnDomainEvent('polis.organization.created')
  onCreated(
    event: DomainEvent<PolisEvents.OrganizationCreated>,
  ): Promise<void> {
    return this.apply({
      id: event.payload.organizationId,
      status: 'active',
      version: event.aggregateVersion,
    });
  }

  @OnDomainEvent('polis.organization.suspended')
  onSuspended(
    event: DomainEvent<PolisEvents.OrganizationSuspended>,
  ): Promise<void> {
    return this.apply({
      id: event.payload.organizationId,
      status: 'suspended',
      version: event.aggregateVersion,
    });
  }

  @OnDomainEvent('polis.organization.reactivated')
  onReactivated(
    event: DomainEvent<PolisEvents.OrganizationReactivated>,
  ): Promise<void> {
    return this.apply({
      id: event.payload.organizationId,
      status: 'active',
      version: event.aggregateVersion,
    });
  }

  /**
   * Stores a state unless the stored one is as new or newer, so events that
   * arrive late or twice, or after a fetch, never move it backwards.
   */
  @Transactional()
  async apply(state: OrganizationState): Promise<void> {
    await this.states.query(
      `INSERT INTO organization_states (id, status, version, synced_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status, version = EXCLUDED.version, synced_at = EXCLUDED.synced_at
         WHERE organization_states.version < EXCLUDED.version`,
      [state.id, state.status, state.version],
    );
  }

  /** The stored state, or Polis's when Hephaestus hasn't seen it yet. */
  private async load(organizationId: string): Promise<OrganizationState> {
    const stored = await this.states.findOneBy({ id: organizationId });
    if (stored) {
      return stored;
    }

    const fetched = await this.polis.getOrganization(organizationId);
    if (!fetched) {
      throw new NotFoundException(`Organization ${organizationId} not found`);
    }
    await this.apply(fetched);

    return fetched;
  }
}
