// This file is generated from agora.asyncapi.yaml by aether-asyncapi-types
// (@aether-os/contracts). Do not edit it by hand; run `pnpm generate:api`.

/**
 * Payload of `agent-version.deprecated`.
 */
export interface AgentVersionDeprecated {
  agentId: string;
  agentVersionId: string;
}

/**
 * Payload of `agent-version.published`.
 */
export interface AgentVersionPublished {
  agentId: string;
  agentVersionId: string;
  /**
   * The policy set version it runs under (Themis); null until policies exist.
   */
  policySetVersionId: string | null;
  /**
   * The version it replaced, now deprecated (`agent-version.deprecated` follows); null for the first.
   */
  previousVersionId: string | null;
  /**
   * The whole version, as `AgentVersionResponse` in `agora.openapi.yaml` (immutable once created).
   */
  version: {
    id: string;
    agentId: string;
    organizationId: string;
    version: number;
    status: 'draft' | 'published' | 'deprecated';
    instructions: string;
    model: {
      provider: string;
      model: string;
      temperature?: number;
      maxTokens?: number;
    };
    capabilities: string[];
    tools: {
      name: string;
      enabled: boolean;
      tools?: string[];
    }[];
    skills: {
      name: string;
      version: string;
      enabled: boolean;
    }[];
    runtime: {
      provider: string;
      executionMode: 'standard' | 'coding';
      sandboxRequired: boolean;
      networkAccess?: 'none' | 'restricted';
      allowedHosts?: string[];
    };
    createdBy: string;
    createdAt: string;
    publishedAt: string | null;
  };
}

/**
 * Payload of `agent.archived`.
 */
export interface AgentArchived {
  agentId: string;
}

/**
 * Payload of `agent.created`.
 */
export interface AgentCreated {
  agentId: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
}

/**
 * Payload of `skill-version.published`.
 */
export interface SkillVersionPublished {
  skillId: string;
  skillVersionId: string;
  /**
   * The whole version, as `SkillVersionResponse` in `agora.openapi.yaml` with its files (immutable once created).
   */
  version: {
    id: string;
    skillId: string;
    organizationId: string;
    name: string;
    version: number;
    description: string;
    files: {
      path: string;
      content: string;
    }[];
    fileCount: number;
    sizeBytes: number;
    createdBy: string;
    createdAt: string;
  };
}

/**
 * Payload of `skill.archived`.
 */
export interface SkillArchived {
  skillId: string;
}

/**
 * Payload of `skill.created`.
 */
export interface SkillCreated {
  skillId: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

/** Every Agora event type, mapped to its payload. */
export interface AgoraEventPayloads {
  'agent-version.deprecated': AgentVersionDeprecated;
  'agent-version.published': AgentVersionPublished;
  'agent.archived': AgentArchived;
  'agent.created': AgentCreated;
  'skill-version.published': SkillVersionPublished;
  'skill.archived': SkillArchived;
  'skill.created': SkillCreated;
}

export type AgoraEventType = keyof AgoraEventPayloads;

/** Every Agora event type in the spec. */
export const AGORA_EVENT_TYPES = [
  'agent-version.deprecated',
  'agent-version.published',
  'agent.archived',
  'agent.created',
  'skill-version.published',
  'skill.archived',
  'skill.created',
] as const satisfies readonly AgoraEventType[];
