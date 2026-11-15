// This file is generated from polis.asyncapi.yaml by aether-asyncapi-types
// (@aether-os/contracts). Do not edit it by hand; run `pnpm generate:api`.

/**
 * Payload of `membership.granted`.
 */
export interface MembershipGranted {
  membershipId: string;
  principal: {
    /**
     * The principal's Pistis `sub`.
     */
    sub: string;
    sub_type: 'user' | 'service_account';
  };
  scope: {
    type: 'organization';
    organizationId: string;
  };
  /**
   * Each role once, highest first.
   *
   * @minItems 1
   */
  roles: ('owner' | 'admin' | 'member' | 'viewer')[];
}

/**
 * Payload of `membership.revoked`.
 */
export interface MembershipRevoked {
  membershipId: string;
  principal: {
    /**
     * The principal's Pistis `sub`.
     */
    sub: string;
    sub_type: 'user' | 'service_account';
  };
  scope: {
    type: 'organization';
    organizationId: string;
  };
}

/**
 * Payload of `membership.role-changed`.
 */
export interface MembershipRoleChanged {
  membershipId: string;
  principal: {
    /**
     * The principal's Pistis `sub`.
     */
    sub: string;
    sub_type: 'user' | 'service_account';
  };
  scope: {
    type: 'organization';
    organizationId: string;
  };
  /**
   * Each role once, highest first.
   *
   * @minItems 1
   */
  from: ('owner' | 'admin' | 'member' | 'viewer')[];
  /**
   * Each role once, highest first.
   *
   * @minItems 1
   */
  to: ('owner' | 'admin' | 'member' | 'viewer')[];
}

/**
 * Payload of `organization.created`.
 */
export interface OrganizationCreated {
  organizationId: string;
  slug: string;
}

/**
 * Payload of `organization.reactivated`.
 */
export interface OrganizationReactivated {
  organizationId: string;
  reason: string | null;
}

/**
 * Payload of `organization.suspended`.
 */
export interface OrganizationSuspended {
  organizationId: string;
  reason: string | null;
}

/**
 * Payload of `project.archived`.
 */
export interface ProjectArchived {
  projectId: string;
}

/**
 * Payload of `project.created`.
 */
export interface ProjectCreated {
  projectId: string;
}

/** Every Polis event type, mapped to its payload. */
export interface PolisEventPayloads {
  'membership.granted': MembershipGranted;
  'membership.revoked': MembershipRevoked;
  'membership.role-changed': MembershipRoleChanged;
  'organization.created': OrganizationCreated;
  'organization.reactivated': OrganizationReactivated;
  'organization.suspended': OrganizationSuspended;
  'project.archived': ProjectArchived;
  'project.created': ProjectCreated;
}

export type PolisEventType = keyof PolisEventPayloads;

/** Every Polis event type in the spec. */
export const POLIS_EVENT_TYPES = [
  'membership.granted',
  'membership.revoked',
  'membership.role-changed',
  'organization.created',
  'organization.reactivated',
  'organization.suspended',
  'project.archived',
  'project.created',
] as const satisfies readonly PolisEventType[];
