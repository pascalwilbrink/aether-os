import "server-only";

import { config } from "../config";
import type { Model, PylonSchema } from "./index";
import { call } from "./http";

type Page<T> = { items: T[]; nextCursor: string | null };

/**
 * Pylon, the model gateway (../docs/pylon.md): the model catalogue, the
 * provider keys and the budgets, with the session's token. A task tree's
 * budget goes through Hephaestus (`lib/api/hephaestus.ts`), which checks the
 * task.
 */
const pylon = <T>(
  path: string,
  token: string,
  init?: Parameters<typeof call>[3],
) => call<T>(config.pylonUrl, path, token, init);

const agentsOf = (organizationId: string) =>
  `/v1/organizations/${organizationId}/agents`;

// --- The model catalogue (the platform's, the same for every organization) ---

/** Active chat models, by name, each with its current price (the first 100). */
export const listActiveModels = (token: string) =>
  pylon<Page<Model>>("/v1/models?status=active&kind=chat&limit=100", token);

// --- Budgets for model calls (docs/models.md: the organization's, a project's and an agent's per month) ---

type Budget = PylonSchema<"BudgetResponse">;
const budgetOf = (organizationId: string, projectId?: string) =>
  projectId
    ? `/v1/organizations/${organizationId}/projects/${projectId}/budget`
    : `/v1/organizations/${organizationId}/budget`;

export const getOrganizationBudget = (token: string, organizationId: string) =>
  pylon<Budget>(budgetOf(organizationId), token);

export const setOrganizationBudget = (
  token: string,
  organizationId: string,
  limitUsd: string | null,
) =>
  pylon<Budget>(budgetOf(organizationId), token, {
    method: "PUT",
    body: { limitUsd },
  });

export const getAgentBudget = (
  token: string,
  organizationId: string,
  agentId: string,
) => pylon<Budget>(`${agentsOf(organizationId)}/${agentId}/budget`, token);

export const setAgentBudget = (
  token: string,
  organizationId: string,
  agentId: string,
  limitUsd: string | null,
) =>
  pylon<Budget>(`${agentsOf(organizationId)}/${agentId}/budget`, token, {
    method: "PUT",
    body: { limitUsd },
  });

export const getProjectBudget = (
  token: string,
  organizationId: string,
  projectId: string,
) => pylon<Budget>(budgetOf(organizationId, projectId), token);

export const setProjectBudget = (
  token: string,
  organizationId: string,
  projectId: string,
  limitUsd: string | null,
) =>
  pylon<Budget>(budgetOf(organizationId, projectId), token, {
    method: "PUT",
    body: { limitUsd },
  });

// --- Provider keys (docs/models.md, Keys): the organization's, and an agent's own; write-only ---

type ModelKeyList = PylonSchema<"ModelKeyList">;
type ModelKey = PylonSchema<"ModelKeyResponse">;
const keysOf = (organizationId: string, agentId?: string) =>
  agentId
    ? `${agentsOf(organizationId)}/${agentId}/model-keys`
    : `/v1/organizations/${organizationId}/model-keys`;

/** Which keys are set (last characters, who, when); never a key. */
export const listModelKeys = (
  token: string,
  organizationId: string,
  agentId?: string,
) => pylon<ModelKeyList>(keysOf(organizationId, agentId), token);

export const setModelKey = (
  token: string,
  organizationId: string,
  provider: string,
  body: PylonSchema<"SetModelKeyRequest">,
  agentId?: string,
) =>
  pylon<ModelKey>(`${keysOf(organizationId, agentId)}/${provider}`, token, {
    method: "PUT",
    body,
  });

/** The models the organization's Ollama server has now. */
export const listOllamaModels = (token: string, organizationId: string) =>
  pylon<PylonSchema<"OllamaModelList">>(
    `/v1/organizations/${organizationId}/ollama/models`,
    token,
  );

export const deleteModelKey = (
  token: string,
  organizationId: string,
  provider: string,
  agentId?: string,
) =>
  pylon<void>(`${keysOf(organizationId, agentId)}/${provider}`, token, {
    method: "DELETE",
  });
