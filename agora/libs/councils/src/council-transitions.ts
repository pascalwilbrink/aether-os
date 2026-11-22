import type { ApiTypes } from '@agora/core';

export type CouncilStatus = ApiTypes.CouncilStatus;
export type CouncilVersionStatus = ApiTypes.CouncilVersionStatus;

/** Archiving a council is final and idempotent. */
export function nextCouncilStatus(
  current: CouncilStatus,
  action: 'archive',
): CouncilStatus {
  const table: Record<'archive', Record<CouncilStatus, CouncilStatus>> = {
    archive: { active: 'archived', archived: 'archived' },
  };
  return table[action][current];
}

export type CouncilVersionAction = 'publish' | 'deprecate';

/**
 * The council version lifecycle, like agents': draft → published →
 * deprecated. Publishing the published version is a no-op; anything else
 * not in the table is an invalid transition (null).
 */
const VERSION_TRANSITIONS: Record<
  CouncilVersionAction,
  Partial<Record<CouncilVersionStatus, CouncilVersionStatus>>
> = {
  publish: { draft: 'published', published: 'published' },
  deprecate: { published: 'deprecated' },
};

export function nextCouncilVersionStatus(
  current: CouncilVersionStatus,
  action: CouncilVersionAction,
): CouncilVersionStatus | null {
  return VERSION_TRANSITIONS[action][current] ?? null;
}
