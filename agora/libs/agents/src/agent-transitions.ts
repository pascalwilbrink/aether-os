import type { ApiTypes } from '@agora/core';

export type AgentStatus = ApiTypes.AgentStatus;
export type AgentVersionStatus = ApiTypes.AgentVersionStatus;

/** Archiving an agent is final and idempotent. */
export function nextAgentStatus(
  current: AgentStatus,
  action: 'archive',
): AgentStatus {
  const table: Record<'archive', Record<AgentStatus, AgentStatus>> = {
    archive: { active: 'archived', archived: 'archived' },
  };

  return table[action][current];
}

export type AgentVersionAction = 'publish' | 'deprecate';

/**
 * The agent version lifecycle: draft → published → deprecated. Publishing
 * the published version is a no-op; anything else not in the table is an
 * invalid transition (null).
 */
const VERSION_TRANSITIONS: Record<
  AgentVersionAction,
  Partial<Record<AgentVersionStatus, AgentVersionStatus>>
> = {
  publish: { draft: 'published', published: 'published' },
  deprecate: { published: 'deprecated' },
};

export function nextAgentVersionStatus(
  current: AgentVersionStatus,
  action: AgentVersionAction,
): AgentVersionStatus | null {
  return VERSION_TRANSITIONS[action][current] ?? null;
}
