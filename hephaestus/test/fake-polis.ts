import { randomUUID } from 'node:crypto';

import type { INestApplicationContext } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import { EventInbox } from '@hephaestus/core';
import {
  PolisClient,
  PolisUnavailableError,
  type OrganizationState,
  type ProjectState,
} from '@hephaestus/tenancy';

/**
 * Polis for tests: what Hephaestus would fetch from Polis's API. Changes that
 * reach Hephaestus through Polis's events go through `deliverPolisEvent`.
 */
export class FakePolis extends PolisClient {
  readonly organizations = new Map<string, OrganizationState>();
  readonly projects = new Map<string, ProjectState>();
  unavailable = false;
  calls = 0;

  /** A new organization in Polis; returns its ID. */
  organization(
    status: OrganizationState['status'] = 'active',
    version = 1,
  ): string {
    const id = randomUUID();
    this.organizations.set(id, { id, status, version });
    return id;
  }

  /** A new project in Polis; returns its ID. */
  project(
    organizationId: string,
    status: ProjectState['status'] = 'active',
    version = 1,
  ): string {
    const id = randomUUID();
    this.projects.set(id, { id, organizationId, status, version });
    return id;
  }

  getOrganization(organizationId: string): Promise<OrganizationState | null> {
    return this.answer(this.organizations.get(organizationId) ?? null);
  }

  getProject(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectState | null> {
    const project = this.projects.get(projectId);
    return this.answer(
      project?.organizationId === organizationId ? project : null,
    );
  }

  private answer<T>(value: T): Promise<T> {
    this.calls++;
    if (this.unavailable) {
      // As HttpPolisClient does for timeouts, network and server errors.
      return Promise.reject(new PolisUnavailableError('Polis is down'));
    }
    return Promise.resolve(value);
  }
}

/** Delivers a Polis event the way the consumer does (inbox, then handlers). */
export function deliverPolisEvent(
  app: INestApplicationContext,
  event: {
    eventType: string;
    aggregateId: string;
    aggregateVersion: number;
    organizationId: string;
    projectId?: string | null;
    payload: Record<string, unknown>;
  },
): Promise<boolean> {
  return app.get(EventInbox).receive('polis', {
    eventId: uuidv7(),
    schemaVersion: 1,
    occurredAt: new Date(),
    projectId: null,
    actor: null,
    ...event,
  });
}

/** Polis suspended (or reactivated) an organization, as an event. */
export function organizationEvent(
  app: INestApplicationContext,
  organizationId: string,
  eventType:
    | 'organization.suspended'
    | 'organization.reactivated'
    | 'organization.created',
  version: number,
): Promise<boolean> {
  return deliverPolisEvent(app, {
    eventType,
    aggregateId: organizationId,
    aggregateVersion: version,
    organizationId,
    payload:
      eventType === 'organization.created'
        ? { organizationId, slug: 'acme' }
        : { organizationId, reason: null },
  });
}

/** Polis archived a project, as an event. */
export function projectArchived(
  app: INestApplicationContext,
  organizationId: string,
  projectId: string,
  version: number,
): Promise<boolean> {
  return deliverPolisEvent(app, {
    eventType: 'project.archived',
    aggregateId: projectId,
    aggregateVersion: version,
    organizationId,
    projectId,
    payload: { projectId },
  });
}
