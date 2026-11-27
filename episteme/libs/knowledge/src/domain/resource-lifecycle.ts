/**
 * A resource's lifecycle (episteme/CLAUDE.md, Lifecycle): pure. `publish`
 * makes it (again) authoritative, `archive` withdraws it for good. Review
 * schedules, expiry and supersession by another resource come later; their
 * states are in the table so a resource in them behaves already.
 */
export type ResourceStatus =
  'draft' | 'active' | 'under_review' | 'expired' | 'superseded' | 'archived';

export type ResourceAction = 'publish' | 'archive';

export const RESOURCE_STATUSES: readonly ResourceStatus[] = [
  'draft',
  'active',
  'under_review',
  'expired',
  'superseded',
  'archived',
];

export const RESOURCE_ACTIONS: readonly ResourceAction[] = [
  'publish',
  'archive',
];

const TRANSITIONS: Readonly<
  Record<ResourceStatus, Partial<Record<ResourceAction, ResourceStatus>>>
> = {
  draft: { publish: 'active', archive: 'archived' },
  active: { publish: 'active', archive: 'archived' },
  under_review: { publish: 'active', archive: 'archived' },
  expired: { publish: 'active', archive: 'archived' },
  superseded: { archive: 'archived' },
  archived: {},
};

/** The status after the action, or null when the status doesn't allow it. */
export function nextResourceStatus(
  status: ResourceStatus,
  action: ResourceAction,
): ResourceStatus | null {
  return TRANSITIONS[status][action] ?? null;
}
