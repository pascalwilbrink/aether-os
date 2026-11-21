import "server-only";

import { config } from "../config";
import type { components } from "./generated/seshat-api";
import { call, type Page } from "./http";

/** Seshat types, generated from ../contracts/seshat.openapi.yaml. */
export type SeshatSchemas = components["schemas"];
export type KnowledgeItem = SeshatSchemas["KnowledgeItemResponse"];
export type KnowledgeItemType = SeshatSchemas["KnowledgeItemType"];
export type KnowledgeItemStatus = SeshatSchemas["KnowledgeItemStatus"];
export type KnowledgeItemVersion = SeshatSchemas["KnowledgeItemVersionResponse"];
export type KnowledgePassage = SeshatSchemas["KnowledgePassage"];
export type KnowledgeSearchResponse = SeshatSchemas["KnowledgeSearchResponse"];
export type NewKnowledgeItem = SeshatSchemas["CreateKnowledgeItemRequest"];
export type KnowledgeItemChange = SeshatSchemas["UpdateKnowledgeItemRequest"];

const seshat = <T>(
  path: string,
  token: string,
  init?: Parameters<typeof call>[3],
) => call<T>(config.seshatUrl, path, token, init);

const knowledgeOf = (organizationId: string, projectId: string) =>
  `/v1/organizations/${organizationId}/projects/${projectId}/knowledge`;

// --- A project's knowledge (`knowledge:read`, `knowledge:write`, `knowledge:approve`) ---

export function listKnowledgeItems(
  token: string,
  organizationId: string,
  projectId: string,
  filter: { type?: KnowledgeItemType; status?: KnowledgeItemStatus } = {},
) {
  const query = new URLSearchParams({ limit: "100" });
  if (filter.type) query.set("type", filter.type);
  if (filter.status) query.set("status", filter.status);
  return seshat<Page<KnowledgeItem>>(
    `${knowledgeOf(organizationId, projectId)}/items?${query}`,
    token,
  );
}

export const getKnowledgeItem = (
  token: string,
  organizationId: string,
  projectId: string,
  itemId: string,
) =>
  seshat<KnowledgeItem>(
    `${knowledgeOf(organizationId, projectId)}/items/${itemId}`,
    token,
  );

export const listKnowledgeItemVersions = (
  token: string,
  organizationId: string,
  projectId: string,
  itemId: string,
) =>
  seshat<Page<KnowledgeItemVersion>>(
    `${knowledgeOf(organizationId, projectId)}/items/${itemId}/versions?limit=50`,
    token,
  );

/** The first passages of an item's current version (a document's text). */
export const listKnowledgeItemPassages = (
  token: string,
  organizationId: string,
  projectId: string,
  itemId: string,
) =>
  seshat<Page<KnowledgePassage>>(
    `${knowledgeOf(organizationId, projectId)}/items/${itemId}/passages?limit=20`,
    token,
  );

export const createKnowledgeItem = (
  token: string,
  organizationId: string,
  projectId: string,
  body: NewKnowledgeItem,
) =>
  seshat<KnowledgeItem>(`${knowledgeOf(organizationId, projectId)}/items`, token, {
    method: "POST",
    body,
  });

export const updateKnowledgeItem = (
  token: string,
  organizationId: string,
  projectId: string,
  itemId: string,
  body: KnowledgeItemChange,
) =>
  seshat<KnowledgeItem>(
    `${knowledgeOf(organizationId, projectId)}/items/${itemId}`,
    token,
    { method: "PUT", body },
  );

/** Accepts or rejects a proposal, or retires an accepted item. */
export const decideKnowledgeItem = (
  token: string,
  organizationId: string,
  projectId: string,
  itemId: string,
  decision: "accept" | "reject" | "retire",
) =>
  seshat<KnowledgeItem>(
    `${knowledgeOf(organizationId, projectId)}/items/${itemId}/${decision}`,
    token,
    { method: "POST" },
  );

/** Registers a file of the project in Loculus as a document to index. */
export const createKnowledgeDocument = (
  token: string,
  organizationId: string,
  projectId: string,
  body: SeshatSchemas["CreateKnowledgeDocumentRequest"],
) =>
  seshat<KnowledgeItem>(
    `${knowledgeOf(organizationId, projectId)}/documents`,
    token,
    { method: "POST", body },
  );

export const searchKnowledge = (
  token: string,
  organizationId: string,
  projectId: string,
  body: SeshatSchemas["SearchKnowledgeRequest"],
) =>
  seshat<KnowledgeSearchResponse>(
    `${knowledgeOf(organizationId, projectId)}/search`,
    token,
    { method: "POST", body },
  );
