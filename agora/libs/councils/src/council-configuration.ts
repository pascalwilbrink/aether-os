import type { ApiTypes } from '@agora/core';

export type CouncilSettings = ApiTypes.CouncilSettings;
export type CouncilDiscussion = ApiTypes.CouncilDiscussion;
export type CouncilMember = ApiTypes.CouncilMember;
export type CouncilMode = ApiTypes.CouncilMode;

/** A version's settings, with every default filled in (../../../../docs/councils.md). */
export function settingsOf(
  requested: ApiTypes.CouncilSettingsRequest | undefined,
): CouncilSettings {
  return {
    defaultMode: requested?.defaultMode ?? 'facilitated',
    allowDirectInteraction: requested?.allowDirectInteraction ?? true,
    allowDiscussion: requested?.allowDiscussion ?? true,
    allowPlanning: requested?.allowPlanning ?? true,
    allowDelegation: requested?.allowDelegation ?? false,
    requireSynthesis: requested?.requireSynthesis ?? true,
  };
}

export function discussionOf(
  requested: ApiTypes.CouncilDiscussionRequest | undefined,
): CouncilDiscussion {
  return {
    maxRounds: requested?.maxRounds ?? 3,
    allowAgentResponses: requested?.allowAgentResponses ?? true,
    requireFacilitatorConclusion:
      requested?.requireFacilitatorConclusion ?? true,
  };
}

/** Whether the settings allow a mode (`facilitated` always is). */
export function modeAllowed(
  mode: CouncilMode,
  settings: CouncilSettings,
): boolean {
  switch (mode) {
    case 'facilitated':
      return true;
    case 'direct':
      return settings.allowDirectInteraction;
    case 'discussion':
      return settings.allowDiscussion;
    case 'planning':
      return settings.allowPlanning;
    case 'delegation':
      return settings.allowDelegation;
  }
}

/** An agent as the checks see it (`AgentsService.statesOf`). */
export interface AgentState {
  id: string;
  name: string;
  status: string;
  latestVersionId: string | null;
}

/**
 * What's wrong with a version's configuration, or null (pure; the agents'
 * states come from `AgentsService`): every agent exists, is active and has
 * a published version; the facilitator isn't a member; each agent is a
 * member once; a conditional member says when; the default mode is allowed.
 */
export function configurationProblem(
  config: {
    facilitator: { agentId: string };
    members: readonly CouncilMember[];
    settings: CouncilSettings;
  },
  agents: readonly AgentState[],
): string | null {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const seen = new Set<string>();
  for (const member of config.members) {
    if (member.agentId === config.facilitator.agentId) {
      return `Agent ${member.agentId} is the facilitator: it can't also be a member.`;
    }
    if (seen.has(member.agentId)) {
      return `Agent ${member.agentId} is a member more than once.`;
    }
    seen.add(member.agentId);
    if (member.participation === 'conditional' && !member.when?.trim()) {
      return `Agent ${member.agentId} is a conditional member: say when it takes part.`;
    }
  }
  for (const agentId of [
    config.facilitator.agentId,
    ...config.members.map((member) => member.agentId),
  ]) {
    const agent = byId.get(agentId);
    if (!agent) {
      return `The organization has no agent ${agentId}.`;
    }
    if (agent.status !== 'active') {
      return `Agent ${agent.name} (${agentId}) is archived.`;
    }
    if (!agent.latestVersionId) {
      return `Agent ${agent.name} (${agentId}) has no published version.`;
    }
  }
  if (!modeAllowed(config.settings.defaultMode, config.settings)) {
    return `The default mode ${config.settings.defaultMode} isn't one the settings allow.`;
  }
  return null;
}
