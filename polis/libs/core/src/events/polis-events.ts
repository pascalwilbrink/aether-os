import type { ApiTypes } from '../api/index.js';

/**
 * The events Polis publishes to `polis.events` (routing key = event type),
 * as described in ../contracts/polis.asyncapi.yaml. Local handlers listen to
 * `polis.<eventType>`. Payloads are thin: IDs and states.
 */
export interface PolisEventPayloads {
  'organization.created': { organizationId: string; slug: string };
  'organization.suspended': { organizationId: string; reason: string | null };
  'organization.reactivated': { organizationId: string; reason: string | null };
  'project.created': { projectId: string };
  'project.archived': { projectId: string };
  'membership.granted': MembershipEventBase & {
    roles: ApiTypes.OrganizationRole[];
  };
  'membership.role-changed': MembershipEventBase & {
    from: ApiTypes.OrganizationRole[];
    to: ApiTypes.OrganizationRole[];
  };
  'membership.revoked': MembershipEventBase;
}

export interface MembershipEventBase {
  membershipId: string;
  principal: { sub: string; sub_type: ApiTypes.SubjectType };
  scope: { type: 'organization'; organizationId: string };
}

export type PolisEventType = keyof PolisEventPayloads;

/** Every Polis event goes to RabbitMQ. */
export const POLIS_PUBLISHED_EVENTS: readonly PolisEventType[] = [
  'organization.created',
  'organization.suspended',
  'organization.reactivated',
  'project.created',
  'project.archived',
  'membership.granted',
  'membership.role-changed',
  'membership.revoked',
];
