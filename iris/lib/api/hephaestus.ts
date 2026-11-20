import "server-only";

import { config } from "../config";
import type {
  Agent,
  AgentVersion,
  ApiSchema,
  Artifact,
  Execution,
  Model,
  Task,
  TaskStatus,
  TaskTemplate,
  TaskTemplateVersion,
} from "./index";
import { call } from "./http";

type Page<T> = { items: T[]; nextCursor: string | null };

const hephaestus = <T>(
  path: string,
  token: string,
  init?: Parameters<typeof call>[3],
) => call<T>(config.hephaestusUrl, path, token, init);

const tasksOf = (organizationId: string, projectId: string) =>
  `/v1/organizations/${organizationId}/projects/${projectId}/tasks`;

// --- Agents and their versions ---

const agentsOf = (organizationId: string) =>
  `/v1/organizations/${organizationId}/agents`;

export const listAgents = (token: string, organizationId: string) =>
  hephaestus<Page<Agent>>(`${agentsOf(organizationId)}?limit=100`, token);

export const getAgent = (
  token: string,
  organizationId: string,
  agentId: string,
) => hephaestus<Agent>(`${agentsOf(organizationId)}/${agentId}`, token);

export const createAgent = (
  token: string,
  organizationId: string,
  body: ApiSchema<"CreateAgentRequest">,
) =>
  hephaestus<Agent>(agentsOf(organizationId), token, { method: "POST", body });

export const archiveAgent = (
  token: string,
  organizationId: string,
  agentId: string,
) =>
  hephaestus<Agent>(`${agentsOf(organizationId)}/${agentId}/archive`, token, {
    method: "POST",
  });

/** Newest first. */
export const listAgentVersions = (
  token: string,
  organizationId: string,
  agentId: string,
) =>
  hephaestus<Page<AgentVersion>>(
    `${agentsOf(organizationId)}/${agentId}/versions?limit=100`,
    token,
  );

export const createAgentVersion = (
  token: string,
  organizationId: string,
  agentId: string,
  body: ApiSchema<"CreateAgentVersionRequest">,
) =>
  hephaestus<AgentVersion>(
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
  hephaestus<AgentVersion>(
    `${agentsOf(organizationId)}/${agentId}/versions/${versionId}/publish`,
    token,
    {
      method: "POST",
    },
  );

// --- The model catalogue (the platform's, the same for every organization) ---

/** Active models, by name, each with its current price (the first 100). */
export const listActiveModels = (token: string) =>
  hephaestus<Page<Model>>("/v1/models?status=active&limit=100", token);

// --- Tasks ---

export function listTasks(
  token: string,
  organizationId: string,
  projectId: string,
  filter: { status?: TaskStatus; cursor?: string } = {},
) {
  const query = new URLSearchParams({ limit: "50" });
  if (filter.status) query.set("status", filter.status);
  if (filter.cursor) query.set("cursor", filter.cursor);
  return hephaestus<Page<Task>>(
    `${tasksOf(organizationId, projectId)}?${query}`,
    token,
  );
}

export const getTask = (
  token: string,
  organizationId: string,
  projectId: string,
  taskId: string,
) => hephaestus<Task>(`${tasksOf(organizationId, projectId)}/${taskId}`, token);

/**
 * Creates a task. The idempotency key comes from the form, so submitting it
 * twice gives the same task.
 */
export const createTask = (
  token: string,
  organizationId: string,
  projectId: string,
  body: ApiSchema<"CreateTaskRequest">,
  idempotencyKey: string,
) =>
  hephaestus<Task>(tasksOf(organizationId, projectId), token, {
    method: "POST",
    body,
    headers: { "idempotency-key": idempotencyKey },
  });

export const cancelTask = (
  token: string,
  organizationId: string,
  projectId: string,
  taskId: string,
) =>
  hephaestus<Task>(
    `${tasksOf(organizationId, projectId)}/${taskId}/cancel`,
    token,
    { method: "POST" },
  );

export const retryTask = (
  token: string,
  organizationId: string,
  projectId: string,
  taskId: string,
) =>
  hephaestus<Task>(
    `${tasksOf(organizationId, projectId)}/${taskId}/retry`,
    token,
    { method: "POST" },
  );

export const listExecutions = (
  token: string,
  organizationId: string,
  projectId: string,
  taskId: string,
) =>
  hephaestus<Page<Execution>>(
    `${tasksOf(organizationId, projectId)}/${taskId}/executions?limit=50`,
    token,
  );

// --- Artifacts and reviews ---

export const listArtifacts = (
  token: string,
  organizationId: string,
  projectId: string,
  taskId: string,
) =>
  hephaestus<Page<Artifact>>(
    `${tasksOf(organizationId, projectId)}/${taskId}/artifacts?limit=100`,
    token,
  );

export type ReviewDecision = "approve" | "reject" | "request-changes";

export const reviewArtifact = (
  token: string,
  organizationId: string,
  projectId: string,
  taskId: string,
  artifactId: string,
  decision: ReviewDecision,
  body: ApiSchema<"ReviewDecisionRequest"> | ApiSchema<"RequestChangesRequest">,
) =>
  hephaestus<Artifact>(
    `${tasksOf(organizationId, projectId)}/${taskId}/artifacts/${artifactId}/${decision}`,
    token,
    {
      method: "POST",
      body,
    },
  );

// --- Task templates ---

/** What a project sees: its own templates and the organization's. */
export const listTaskTemplates = (
  token: string,
  organizationId: string,
  projectId: string,
) =>
  hephaestus<Page<TaskTemplate>>(
    `/v1/organizations/${organizationId}/task-templates?projectId=${projectId}&limit=100`,
    token,
  );

/** The organization-wide templates (every project sees them). */
export const listOrganizationTaskTemplates = (
  token: string,
  organizationId: string,
) =>
  hephaestus<Page<TaskTemplate>>(
    `/v1/organizations/${organizationId}/task-templates?limit=100`,
    token,
  );

export const getTaskTemplate = (
  token: string,
  organizationId: string,
  templateId: string,
) =>
  hephaestus<TaskTemplate>(
    `/v1/organizations/${organizationId}/task-templates/${templateId}`,
    token,
  );

export const getTaskTemplateVersion = (
  token: string,
  organizationId: string,
  templateId: string,
  version: number,
) =>
  hephaestus<TaskTemplateVersion>(
    `/v1/organizations/${organizationId}/task-templates/${templateId}/versions/${version}`,
    token,
  );

export const createTaskFromTemplate = (
  token: string,
  organizationId: string,
  projectId: string,
  templateId: string,
  body: ApiSchema<"CreateTaskFromTemplateRequest">,
  idempotencyKey: string,
) =>
  hephaestus<Task>(
    `/v1/organizations/${organizationId}/projects/${projectId}/task-templates/${templateId}/tasks`,
    token,
    { method: "POST", body, headers: { "idempotency-key": idempotencyKey } },
  );

// --- Budgets for model calls (docs/models.md: the organization's, a project's and an agent's per month, a task tree's) ---

type Budget = ApiSchema<"BudgetResponse">;
const budgetOf = (organizationId: string, projectId?: string) =>
  projectId
    ? `/v1/organizations/${organizationId}/projects/${projectId}/budget`
    : `/v1/organizations/${organizationId}/budget`;

export const getOrganizationBudget = (token: string, organizationId: string) =>
  hephaestus<Budget>(budgetOf(organizationId), token);

export const setOrganizationBudget = (
  token: string,
  organizationId: string,
  limitUsd: string | null,
) =>
  hephaestus<Budget>(budgetOf(organizationId), token, {
    method: "PUT",
    body: { limitUsd },
  });

export const getAgentBudget = (
  token: string,
  organizationId: string,
  agentId: string,
) => hephaestus<Budget>(`${agentsOf(organizationId)}/${agentId}/budget`, token);

export const setAgentBudget = (
  token: string,
  organizationId: string,
  agentId: string,
  limitUsd: string | null,
) =>
  hephaestus<Budget>(`${agentsOf(organizationId)}/${agentId}/budget`, token, {
    method: "PUT",
    body: { limitUsd },
  });

export const getProjectBudget = (
  token: string,
  organizationId: string,
  projectId: string,
) => hephaestus<Budget>(budgetOf(organizationId, projectId), token);

export const setProjectBudget = (
  token: string,
  organizationId: string,
  projectId: string,
  limitUsd: string | null,
) =>
  hephaestus<Budget>(budgetOf(organizationId, projectId), token, {
    method: "PUT",
    body: { limitUsd },
  });

/** The budget of the task's tree (its top-level task's). */
export const getTaskTreeBudget = (
  token: string,
  organizationId: string,
  projectId: string,
  taskId: string,
) =>
  hephaestus<Budget>(
    `${tasksOf(organizationId, projectId)}/${taskId}/budget`,
    token,
  );

export const setTaskTreeBudget = (
  token: string,
  organizationId: string,
  projectId: string,
  taskId: string,
  limitUsd: string | null,
) =>
  hephaestus<Budget>(
    `${tasksOf(organizationId, projectId)}/${taskId}/budget`,
    token,
    {
      method: "PUT",
      body: { limitUsd },
    },
  );

// --- Provider keys (docs/models.md, Keys): the organization's, and an agent's own; write-only ---

type ModelKeyList = ApiSchema<"ModelKeyList">;
type ModelKey = ApiSchema<"ModelKeyResponse">;
const keysOf = (organizationId: string, agentId?: string) =>
  agentId
    ? `${agentsOf(organizationId)}/${agentId}/model-keys`
    : `/v1/organizations/${organizationId}/model-keys`;

/** Which keys are set (last characters, who, when); never a key. */
export const listModelKeys = (
  token: string,
  organizationId: string,
  agentId?: string,
) => hephaestus<ModelKeyList>(keysOf(organizationId, agentId), token);

export const setModelKey = (
  token: string,
  organizationId: string,
  provider: string,
  body: ApiSchema<"SetModelKeyRequest">,
  agentId?: string,
) =>
  hephaestus<ModelKey>(
    `${keysOf(organizationId, agentId)}/${provider}`,
    token,
    { method: "PUT", body },
  );

/** The models the organization's Ollama server has now. */
export const listOllamaModels = (token: string, organizationId: string) =>
  hephaestus<ApiSchema<"OllamaModelList">>(
    `/v1/organizations/${organizationId}/ollama/models`,
    token,
  );

export const deleteModelKey = (
  token: string,
  organizationId: string,
  provider: string,
  agentId?: string,
) =>
  hephaestus<void>(`${keysOf(organizationId, agentId)}/${provider}`, token, {
    method: "DELETE",
  });

// --- Tool servers (MCP) the organization's agent versions take tools from ---

type ToolServerList = ApiSchema<"ToolServerList">;
type ToolServer = ApiSchema<"ToolServerResponse">;
const toolServersOf = (organizationId: string) =>
  `/v1/organizations/${organizationId}/tool-servers`;

export const listToolServers = (token: string, organizationId: string) =>
  hephaestus<ToolServerList>(toolServersOf(organizationId), token);

export const getToolServer = (
  token: string,
  organizationId: string,
  toolServerId: string,
) =>
  hephaestus<ToolServer>(
    `${toolServersOf(organizationId)}/${toolServerId}`,
    token,
  );

export const createToolServer = (
  token: string,
  organizationId: string,
  body: ApiSchema<"CreateToolServerRequest">,
) =>
  hephaestus<ToolServer>(toolServersOf(organizationId), token, {
    method: "POST",
    body,
  });

export const updateToolServer = (
  token: string,
  organizationId: string,
  toolServerId: string,
  body: ApiSchema<"UpdateToolServerRequest">,
) =>
  hephaestus<ToolServer>(
    `${toolServersOf(organizationId)}/${toolServerId}`,
    token,
    { method: "PUT", body },
  );

export const deleteToolServer = (
  token: string,
  organizationId: string,
  toolServerId: string,
) =>
  hephaestus<void>(`${toolServersOf(organizationId)}/${toolServerId}`, token, {
    method: "DELETE",
  });

/** Stored in OpenBao; never returned. */
export const setToolServerCredential = (
  token: string,
  organizationId: string,
  toolServerId: string,
  value: string,
) =>
  hephaestus<ToolServer>(
    `${toolServersOf(organizationId)}/${toolServerId}/credential`,
    token,
    {
      method: "PUT",
      body: { value },
    },
  );

export const deleteToolServerCredential = (
  token: string,
  organizationId: string,
  toolServerId: string,
) =>
  hephaestus<void>(
    `${toolServersOf(organizationId)}/${toolServerId}/credential`,
    token,
    { method: "DELETE" },
  );

/** What the server offers now (Hephaestus connects to it). */
export const listToolServerTools = (
  token: string,
  organizationId: string,
  toolServerId: string,
) =>
  hephaestus<ApiSchema<"ToolList">>(
    `${toolServersOf(organizationId)}/${toolServerId}/tools`,
    token,
  );

// --- Skills (Agent Skills folders) agent versions pin ---

type Skill = ApiSchema<"SkillResponse">;
type SkillVersion = ApiSchema<"SkillVersionResponse">;
const skillsOf = (organizationId: string) =>
  `/v1/organizations/${organizationId}/skills`;

export const listSkills = (
  token: string,
  organizationId: string,
  status?: ApiSchema<"SkillStatus">,
) =>
  hephaestus<Page<Skill>>(
    `${skillsOf(organizationId)}?limit=100${status ? `&status=${status}` : ""}`,
    token,
  );

export const getSkill = (
  token: string,
  organizationId: string,
  skillId: string,
) => hephaestus<Skill>(`${skillsOf(organizationId)}/${skillId}`, token);

export const createSkill = (
  token: string,
  organizationId: string,
  body: ApiSchema<"CreateSkillRequest">,
) =>
  hephaestus<Skill>(skillsOf(organizationId), token, { method: "POST", body });

export const archiveSkill = (
  token: string,
  organizationId: string,
  skillId: string,
) =>
  hephaestus<Skill>(`${skillsOf(organizationId)}/${skillId}/archive`, token, {
    method: "POST",
  });

/** Newest first, without files. */
export const listSkillVersions = (
  token: string,
  organizationId: string,
  skillId: string,
) =>
  hephaestus<Page<SkillVersion>>(
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
  hephaestus<SkillVersion>(
    `${skillsOf(organizationId)}/${skillId}/versions/${version}`,
    token,
  );

export const createSkillVersion = (
  token: string,
  organizationId: string,
  skillId: string,
  body: ApiSchema<"CreateSkillVersionRequest">,
) =>
  hephaestus<SkillVersion>(
    `${skillsOf(organizationId)}/${skillId}/versions`,
    token,
    { method: "POST", body },
  );
