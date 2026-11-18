import "server-only";

import { config } from "../config";
import type {
  Agent,
  ApiSchema,
  Artifact,
  Execution,
  Task,
  TaskStatus,
  TaskTemplate,
  TaskTemplateVersion,
} from "./index";
import { call } from "./http";

type Page<T> = { items: T[]; nextCursor: string | null };

const hephaestus = <T>(path: string, token: string, init?: Parameters<typeof call>[3]) =>
  call<T>(config.hephaestusUrl, path, token, init);

const tasksOf = (organizationId: string, projectId: string) =>
  `/v1/organizations/${organizationId}/projects/${projectId}/tasks`;

export const listAgents = (token: string, organizationId: string) =>
  hephaestus<Page<Agent>>(`/v1/organizations/${organizationId}/agents?limit=100`, token);

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
  return hephaestus<Page<Task>>(`${tasksOf(organizationId, projectId)}?${query}`, token);
}

export const getTask = (token: string, organizationId: string, projectId: string, taskId: string) =>
  hephaestus<Task>(`${tasksOf(organizationId, projectId)}/${taskId}`, token);

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

export const cancelTask = (token: string, organizationId: string, projectId: string, taskId: string) =>
  hephaestus<Task>(`${tasksOf(organizationId, projectId)}/${taskId}/cancel`, token, { method: "POST" });

export const retryTask = (token: string, organizationId: string, projectId: string, taskId: string) =>
  hephaestus<Task>(`${tasksOf(organizationId, projectId)}/${taskId}/retry`, token, { method: "POST" });

export const listExecutions = (token: string, organizationId: string, projectId: string, taskId: string) =>
  hephaestus<Page<Execution>>(`${tasksOf(organizationId, projectId)}/${taskId}/executions?limit=50`, token);

// --- Artifacts and reviews ---

export const listArtifacts = (token: string, organizationId: string, projectId: string, taskId: string) =>
  hephaestus<Page<Artifact>>(`${tasksOf(organizationId, projectId)}/${taskId}/artifacts?limit=100`, token);

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
  hephaestus<Artifact>(`${tasksOf(organizationId, projectId)}/${taskId}/artifacts/${artifactId}/${decision}`, token, {
    method: "POST",
    body,
  });

// --- Task templates ---

/** What a project sees: its own templates and the organization's. */
export const listTaskTemplates = (token: string, organizationId: string, projectId: string) =>
  hephaestus<Page<TaskTemplate>>(
    `/v1/organizations/${organizationId}/task-templates?projectId=${projectId}&limit=100`,
    token,
  );

export const getTaskTemplate = (token: string, organizationId: string, templateId: string) =>
  hephaestus<TaskTemplate>(`/v1/organizations/${organizationId}/task-templates/${templateId}`, token);

export const getTaskTemplateVersion = (token: string, organizationId: string, templateId: string, version: number) =>
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
