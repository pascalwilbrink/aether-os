import type { ApiTypes } from '@hephaestus/core';

export type ProjectStatus = ApiTypes.ProjectStatus;
export type ProjectAction = 'archive';

/**
 * The project lifecycle. Archiving is final and idempotent (docs/api.md):
 * archiving an archived project leaves it archived.
 */
const TRANSITIONS: Record<
  ProjectAction,
  Record<ProjectStatus, ProjectStatus>
> = {
  archive: { active: 'archived', archived: 'archived' },
};

export function nextProjectStatus(
  current: ProjectStatus,
  action: ProjectAction,
): ProjectStatus {
  return TRANSITIONS[action][current];
}
