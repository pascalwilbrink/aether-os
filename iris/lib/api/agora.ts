import "server-only";

import { config } from "../config";
import type { Agent, AgentVersion, AgoraSchema } from "./index";
import { call, type Page } from "./http";

const agora = <T>(
  path: string,
  token: string,
  init?: Parameters<typeof call>[3],
) => call<T>(config.agoraUrl, path, token, init);

// --- Agents and their versions ---

const agentsOf = (organizationId: string) =>
  `/v1/organizations/${organizationId}/agents`;

export const listAgents = (token: string, organizationId: string) =>
  agora<Page<Agent>>(`${agentsOf(organizationId)}?limit=100`, token);

export const getAgent = (
  token: string,
  organizationId: string,
  agentId: string,
) => agora<Agent>(`${agentsOf(organizationId)}/${agentId}`, token);

export const createAgent = (
  token: string,
  organizationId: string,
  body: AgoraSchema<"CreateAgentRequest">,
) => agora<Agent>(agentsOf(organizationId), token, { method: "POST", body });

export const archiveAgent = (
  token: string,
  organizationId: string,
  agentId: string,
) =>
  agora<Agent>(`${agentsOf(organizationId)}/${agentId}/archive`, token, {
    method: "POST",
  });

/** Newest first. */
export const listAgentVersions = (
  token: string,
  organizationId: string,
  agentId: string,
) =>
  agora<Page<AgentVersion>>(
    `${agentsOf(organizationId)}/${agentId}/versions?limit=100`,
    token,
  );

export const createAgentVersion = (
  token: string,
  organizationId: string,
  agentId: string,
  body: AgoraSchema<"CreateAgentVersionRequest">,
) =>
  agora<AgentVersion>(
    `${agentsOf(organizationId)}/${agentId}/versions`,
    token,
    { method: "POST", body },
  );

export const publishAgentVersion = (
  token: string,
  organizationId: string,
  agentId: string,
  versionId: string,
) =>
  agora<AgentVersion>(
    `${agentsOf(organizationId)}/${agentId}/versions/${versionId}/publish`,
    token,
    {
      method: "POST",
    },
  );
