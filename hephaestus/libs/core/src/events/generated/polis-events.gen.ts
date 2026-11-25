// This file is generated from polis.asyncapi.yaml by aether-asyncapi-types
// (@aether-os/contracts). Do not edit it by hand; run `pnpm generate:api`.

/**
 * Payload of `department.archived`.
 */
export interface DepartmentArchived {
  departmentId: string;
}

/**
 * Payload of `department.created`.
 */
export interface DepartmentCreated {
  departmentId: string;
  slug: string;
}

/**
 * Payload of `department.updated`.
 */
export interface DepartmentUpdated {
  departmentId: string;
}

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
 * Payload of `person.created`.
 */
export interface PersonCreated {
  personId: string;
  /**
   * The linked Pistis user, if any.
   */
  userId: string | null;
  departmentIds: string[];
}

/**
 * Payload of `person.deleted`.
 */
export interface PersonDeleted {
  personId: string;
}

/**
 * Payload of `person.updated`.
 */
export interface PersonUpdated {
  personId: string;
  /**
   * The linked Pistis user, if any.
   */
  userId: string | null;
  departmentIds: string[];
}

/**
 * Payload of `project-membership.granted`.
 */
export interface ProjectMembershipGranted {
  membershipId: string;
  principal: {
    /**
     * The principal's Pistis `sub`.
     */
    sub: string;
    sub_type: 'user' | 'service_account';
  };
  scope: {
    type: 'project';
    organizationId: string;
    projectId: string;
  };
  role: 'approver' | 'editor' | 'viewer';
}

/**
 * Payload of `project-membership.revoked`.
 */
export interface ProjectMembershipRevoked {
  membershipId: string;
  principal: {
    /**
     * The principal's Pistis `sub`.
     */
    sub: string;
    sub_type: 'user' | 'service_account';
  };
  scope: {
    type: 'project';
    organizationId: string;
    projectId: string;
  };
}

/**
 * Payload of `project-membership.role-changed`.
 */
export interface ProjectMembershipRoleChanged {
  membershipId: string;
  principal: {
    /**
     * The principal's Pistis `sub`.
     */
    sub: string;
    sub_type: 'user' | 'service_account';
  };
  scope: {
    type: 'project';
    organizationId: string;
    projectId: string;
  };
  from: 'approver' | 'editor' | 'viewer';
  to: 'approver' | 'editor' | 'viewer';
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
  /**
   * The department it was created in, if any.
   */
  departmentId: string | null;
}

/**
 * Payload of `project.department-changed`.
 */
export interface ProjectDepartmentChanged {
  projectId: string;
  /**
   * The department it was in, if any.
   */
  from: string | null;
  /**
   * The department it's in now, if any.
   */
  to: string | null;
}

/** Every Polis event type, mapped to its payload. */
export interface PolisEventPayloads {
  'department.archived': DepartmentArchived;
  'department.created': DepartmentCreated;
  'department.updated': DepartmentUpdated;
  'membership.granted': MembershipGranted;
  'membership.revoked': MembershipRevoked;
  'membership.role-changed': MembershipRoleChanged;
  'organization.created': OrganizationCreated;
  'organization.reactivated': OrganizationReactivated;
  'organization.suspended': OrganizationSuspended;
  'person.created': PersonCreated;
  'person.deleted': PersonDeleted;
  'person.updated': PersonUpdated;
  'project-membership.granted': ProjectMembershipGranted;
  'project-membership.revoked': ProjectMembershipRevoked;
  'project-membership.role-changed': ProjectMembershipRoleChanged;
  'project.archived': ProjectArchived;
  'project.created': ProjectCreated;
  'project.department-changed': ProjectDepartmentChanged;
}

export type PolisEventType = keyof PolisEventPayloads;

/** Every Polis event type in the spec. */
export const POLIS_EVENT_TYPES = [
  'department.archived',
  'department.created',
  'department.updated',
  'membership.granted',
  'membership.revoked',
  'membership.role-changed',
  'organization.created',
  'organization.reactivated',
  'organization.suspended',
  'person.created',
  'person.deleted',
  'person.updated',
  'project-membership.granted',
  'project-membership.revoked',
  'project-membership.role-changed',
  'project.archived',
  'project.created',
  'project.department-changed',
] as const satisfies readonly PolisEventType[];
