import "server-only";

import { config } from "../config";
import type {
  AgentSession,
  AgentSessionMessage,
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

/** A template and its first version (organization-wide without `projectId`). */
export const createTaskTemplate = (
  token: string,
  organizationId: string,
  body: ApiSchema<"CreateTaskTemplateRequest">,
) =>
  hephaestus<TaskTemplate>(
    `/v1/organizations/${organizationId}/task-templates`,
    token,
    { method: "POST", body },
  );

/** Editing a template: its next version (earlier ones never change). */
export const createTaskTemplateVersion = (
  token: string,
  organizationId: string,
  templateId: string,
  body: ApiSchema<"TaskTemplateContent">,
) =>
  hephaestus<TaskTemplateVersion>(
    `/v1/organizations/${organizationId}/task-templates/${templateId}/versions`,
    token,
    { method: "POST", body },
  );

/** No new tasks from it; tasks and templates that pinned a version keep it. */
export const archiveTaskTemplate = (
  token: string,
  organizationId: string,
  templateId: string,
) =>
  hephaestus<TaskTemplate>(
    `/v1/organizations/${organizationId}/task-templates/${templateId}/archive`,
    token,
    { method: "POST" },
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

// --- Sessions (docs/interaction.md, docs/councils.md) ---

const sessionsOf = (organizationId: string, projectId: string) =>
  `/v1/organizations/${organizationId}/projects/${projectId}/sessions`;

/** The person's own sessions in the project, newest first. */
export const listSessions = (
  token: string,
  organizationId: string,
  projectId: string,
) =>
  hephaestus<Page<AgentSession>>(
    `${sessionsOf(organizationId, projectId)}?limit=50`,
    token,
  );

/** Starts a session with an agent or a council (exactly one of them). */
export const createSession = (
  token: string,
  organizationId: string,
  projectId: string,
  body: ApiSchema<"CreateSessionRequest">,
) =>
  hephaestus<AgentSession>(sessionsOf(organizationId, projectId), token, {
    method: "POST",
    body,
  });

export const getSession = (
  token: string,
  organizationId: string,
  projectId: string,
  sessionId: string,
) =>
  hephaestus<AgentSession>(
    `${sessionsOf(organizationId, projectId)}/${sessionId}`,
    token,
  );

/** The conversation, oldest first: up to `max` messages, page by page. */
export async function listSessionMessages(
  token: string,
  organizationId: string,
  projectId: string,
  sessionId: string,
  max = 500,
): Promise<AgentSessionMessage[]> {
  const messages: AgentSessionMessage[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const page: Page<AgentSessionMessage> = await hephaestus(
      `${sessionsOf(organizationId, projectId)}/${sessionId}/messages?${query}`,
      token,
    );
    messages.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor && messages.length < max);
  return messages;
}

export const endSession = (
  token: string,
  organizationId: string,
  projectId: string,
  sessionId: string,
) =>
  hephaestus<AgentSession>(
    `${sessionsOf(organizationId, projectId)}/${sessionId}/end`,
    token,
    { method: "POST" },
  );

/** Where a session's AG-UI endpoint is (the run route streams from it). */
export const sessionRunsUrl = (
  organizationId: string,
  projectId: string,
  sessionId: string,
) =>
  new URL(
    `${sessionsOf(organizationId, projectId)}/${sessionId}/runs`,
    config.hephaestusUrl,
  );
