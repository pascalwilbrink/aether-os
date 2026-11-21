import "server-only";

import { config } from "../config";
import type {
  ApiSchema,
  Artifact,
  Execution,
  ExecutionEventPage,
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

/** What an execution did after `after` (docs/tasks.md, Activity), oldest first. */
export const listExecutionEvents = (
  token: string,
  organizationId: string,
  projectId: string,
  taskId: string,
  executionId: string,
  after = 0,
  limit = 500,
) =>
  hephaestus<ExecutionEventPage>(
    `${tasksOf(organizationId, projectId)}/${taskId}/executions/${executionId}/events?after=${after}&limit=${limit}`,
    token,
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

// --- A task tree's budget: Pylon's, through any task of the tree (Hephaestus checks the task) ---

type Budget = ApiSchema<"BudgetResponse">;

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
