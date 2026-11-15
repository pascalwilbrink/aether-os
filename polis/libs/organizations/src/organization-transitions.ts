import type { ApiTypes } from '@polis/core';

export type OrganizationStatus = ApiTypes.OrganizationStatus;
export type OrganizationAction = 'suspend' | 'activate';

/**
 * The organization lifecycle. Every action is allowed in every state and is
 * idempotent (docs/api.md): suspending a suspended organization leaves it
 * suspended.
 */
const TRANSITIONS: Record<
  OrganizationAction,
  Record<OrganizationStatus, OrganizationStatus>
> = {
  suspend: { active: 'suspended', suspended: 'suspended' },
  activate: { active: 'active', suspended: 'active' },
};

export function nextOrganizationStatus(
  current: OrganizationStatus,
  action: OrganizationAction,
): OrganizationStatus {
  return TRANSITIONS[action][current];
}

/** Writes to an organization's resources are only allowed while it's active. */
export function organizationAcceptsWrites(status: OrganizationStatus): boolean {
  return status === 'active';
}
