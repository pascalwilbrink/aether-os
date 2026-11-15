import type { ApiTypes } from '@hephaestus/core';

export type WorkspaceStatus = ApiTypes.WorkspaceStatus;

/** User actions (HTTP) and provisioner callbacks (system-driven). */
export type WorkspaceAction =
  | 'acquire'
  | 'release'
  | 'suspend'
  | 'resume'
  | 'destroy'
  | 'startProvisioning'
  | 'markReady'
  | 'markDestroyed'
  | 'markFailed'
  | 'expire';

const ALL: readonly WorkspaceStatus[] = [
  'requested',
  'provisioning',
  'ready',
  'in_use',
  'suspended',
  'stopping',
  'destroyed',
  'failed',
  'expired',
];

/** Any state except these can fail or expire. */
const ENDED_OR_STOPPING: readonly WorkspaceStatus[] = [
  'destroyed',
  'stopping',
  'expired',
];

const from = (
  states: readonly WorkspaceStatus[],
  to: WorkspaceStatus,
): Partial<Record<WorkspaceStatus, WorkspaceStatus>> =>
  Object.fromEntries(states.map((state) => [state, to]));

/**
 * The workspace lifecycle: every allowed (status, action) pair and where it
 * leads. Anything missing is an invalid transition. Workspace transitions
 * are strict, not idempotent: acquiring an in-use workspace is a conflict.
 */
export const WORKSPACE_TRANSITIONS: Record<
  WorkspaceAction,
  Partial<Record<WorkspaceStatus, WorkspaceStatus>>
> = {
  startProvisioning: { requested: 'provisioning' },
  markReady: { provisioning: 'ready' },
  acquire: { ready: 'in_use' },
  release: { in_use: 'ready' },
  suspend: { ready: 'suspended' },
  resume: { suspended: 'ready' },
  destroy: from(
    ['ready', 'in_use', 'suspended', 'failed', 'expired'],
    'stopping',
  ),
  markDestroyed: { stopping: 'destroyed' },
  markFailed: from(
    ALL.filter((state) => !ENDED_OR_STOPPING.includes(state)),
    'failed',
  ),
  expire: from(
    ALL.filter((state) => !ENDED_OR_STOPPING.includes(state)),
    'expired',
  ),
};

/** Where `action` leads from `current`, or null if it isn't allowed. */
export function nextWorkspaceStatus(
  current: WorkspaceStatus,
  action: WorkspaceAction,
): WorkspaceStatus | null {
  return WORKSPACE_TRANSITIONS[action][current] ?? null;
}

export { ALL as WORKSPACE_STATUSES };
