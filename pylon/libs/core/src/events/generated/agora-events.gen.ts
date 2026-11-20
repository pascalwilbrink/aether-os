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

/** Every Agora event type, mapped to its payload. */
export interface AgoraEventPayloads {
  'agent-version.deprecated': AgentVersionDeprecated;
  'agent-version.published': AgentVersionPublished;
  'agent.archived': AgentArchived;
  'agent.created': AgentCreated;
}

export type AgoraEventType = keyof AgoraEventPayloads;

/** Every Agora event type in the spec. */
export const AGORA_EVENT_TYPES = [
  'agent-version.deprecated',
  'agent-version.published',
  'agent.archived',
  'agent.created',
] as const satisfies readonly AgoraEventType[];
