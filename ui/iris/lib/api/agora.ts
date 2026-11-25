import "server-only";

import { config } from "../config";
import type {
  Agent,
  AgentVersion,
  AgoraSchema,
  Council,
  CouncilVersion,
  Skill,
  SkillVersion,
} from "./index";
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

// --- Skills (Agent Skills folders) agent versions pin ---

const skillsOf = (organizationId: string) =>
  `/v1/organizations/${organizationId}/skills`;

export const listSkills = (
  token: string,
  organizationId: string,
  status?: AgoraSchema<"SkillStatus">,
) =>
  agora<Page<Skill>>(
    `${skillsOf(organizationId)}?limit=100${status ? `&status=${status}` : ""}`,
    token,
  );

export const getSkill = (
  token: string,
  organizationId: string,
  skillId: string,
) => agora<Skill>(`${skillsOf(organizationId)}/${skillId}`, token);

export const createSkill = (
  token: string,
  organizationId: string,
  body: AgoraSchema<"CreateSkillRequest">,
) =>
  agora<Skill>(skillsOf(organizationId), token, { method: "POST", body });

export const archiveSkill = (
  token: string,
  organizationId: string,
  skillId: string,
) =>
  agora<Skill>(`${skillsOf(organizationId)}/${skillId}/archive`, token, {
    method: "POST",
  });

/** Newest first, without files. */
export const listSkillVersions = (
  token: string,
  organizationId: string,
  skillId: string,
) =>
  agora<Page<SkillVersion>>(
    `${skillsOf(organizationId)}/${skillId}/versions?limit=100`,
    token,
  );

/** With its files. */
export const getSkillVersion = (
  token: string,
  organizationId: string,
  skillId: string,
  version: number,
) =>
  agora<SkillVersion>(
    `${skillsOf(organizationId)}/${skillId}/versions/${version}`,
    token,
  );

export const createSkillVersion = (
  token: string,
  organizationId: string,
  skillId: string,
  body: AgoraSchema<"CreateSkillVersionRequest">,
) =>
  agora<SkillVersion>(
    `${skillsOf(organizationId)}/${skillId}/versions`,
    token,
    { method: "POST", body },
  );

// --- Councils and their versions (docs/councils.md) ---

const councilsOf = (organizationId: string) =>
  `/v1/organizations/${organizationId}/councils`;

export const listCouncils = (token: string, organizationId: string) =>
  agora<Page<Council>>(`${councilsOf(organizationId)}?limit=100`, token);

export const getCouncil = (
  token: string,
  organizationId: string,
  councilId: string,
) => agora<Council>(`${councilsOf(organizationId)}/${councilId}`, token);

export const createCouncil = (
  token: string,
  organizationId: string,
  body: AgoraSchema<"CreateCouncilRequest">,
) =>
  agora<Council>(councilsOf(organizationId), token, { method: "POST", body });

export const archiveCouncil = (
  token: string,
  organizationId: string,
  councilId: string,
) =>
  agora<Council>(`${councilsOf(organizationId)}/${councilId}/archive`, token, {
    method: "POST",
  });

/** Highest version first. */
export const listCouncilVersions = (
  token: string,
  organizationId: string,
  councilId: string,
) =>
  agora<Page<CouncilVersion>>(
    `${councilsOf(organizationId)}/${councilId}/versions?limit=100`,
    token,
  );

export const createCouncilVersion = (
  token: string,
  organizationId: string,
  councilId: string,
  body: AgoraSchema<"CreateCouncilVersionRequest">,
) =>
  agora<CouncilVersion>(
    `${councilsOf(organizationId)}/${councilId}/versions`,
    token,
    { method: "POST", body },
  );

export const publishCouncilVersion = (
  token: string,
  organizationId: string,
  councilId: string,
  versionId: string,
) =>
  agora<CouncilVersion>(
    `${councilsOf(organizationId)}/${councilId}/versions/${versionId}/publish`,
    token,
    { method: "POST" },
  );
