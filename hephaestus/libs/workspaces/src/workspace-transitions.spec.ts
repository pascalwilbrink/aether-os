import {
  nextWorkspaceStatus,
  WORKSPACE_STATUSES,
  type WorkspaceAction,
  type WorkspaceStatus,
} from './workspace-transitions.js';

/** The whole lifecycle, written out: anything not listed is invalid. */
const ALLOWED: Record<
  WorkspaceAction,
  Partial<Record<WorkspaceStatus, WorkspaceStatus>>
> = {
  startProvisioning: { requested: 'provisioning' },
  markReady: { provisioning: 'ready' },
  acquire: { ready: 'in_use' },
  release: { in_use: 'ready' },
  suspend: { ready: 'suspended' },
  resume: { suspended: 'ready' },
  destroy: {
    ready: 'stopping',
    in_use: 'stopping',
    suspended: 'stopping',
    failed: 'stopping',
    expired: 'stopping',
  },
  markDestroyed: { stopping: 'destroyed' },
  markFailed: {
    requested: 'failed',
    provisioning: 'failed',
    ready: 'failed',
    in_use: 'failed',
    suspended: 'failed',
    failed: 'failed',
  },
  expire: {
    requested: 'expired',
    provisioning: 'expired',
    ready: 'expired',
    in_use: 'expired',
    suspended: 'expired',
    failed: 'expired',
  },
};

describe('workspace transitions', () => {
  const cases = (Object.keys(ALLOWED) as WorkspaceAction[]).flatMap((action) =>
    WORKSPACE_STATUSES.map(
      (status) => [status, action, ALLOWED[action][status] ?? null] as const,
    ),
  );

  it.each(cases)('%s --%s--> %s', (status, action, next) => {
    expect(nextWorkspaceStatus(status, action)).toBe(next);
  });

  it('covers every status and action', () => {
    expect(cases).toHaveLength(WORKSPACE_STATUSES.length * 10);
  });
});
