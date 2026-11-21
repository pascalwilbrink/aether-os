"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { uploadFile } from "@/lib/api/loculus";
import { messageOf } from "@/lib/api/messages";
import {
  createKnowledgeDocument,
  createKnowledgeItem,
  decideKnowledgeItem,
  deleteKnowledgeRepository,
  putKnowledgeRepository,
  syncKnowledgeRepository,
  updateKnowledgeItem,
} from "@/lib/api/seshat";
import { requireOrganization } from "@/lib/auth/current";
import { contentTypeFor } from "@/lib/files";
import { valuesOf } from "@/lib/forms";
import { newItemOf, pathsFromText, tagsOf } from "@/lib/knowledge";

import type { FormState, ProjectRef } from "../actions";

const knowledgePath = ({ organizationId, projectId }: ProjectRef) =>
  `/orgs/${organizationId}/projects/${projectId}/knowledge`;

/** The largest document Seshat indexes (its DOCUMENT_MAX_BYTES default). */
const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

const seshatMessageOf = (error: unknown) =>
  messageOf(error, {
    FORBIDDEN:
      "Your role in this project doesn't allow that: writing needs editor or above, accepting and retiring approver or above.",
    PROJECT_ARCHIVED: "The project is archived.",
    ORGANIZATION_SUSPENDED: "The organization is suspended.",
    KNOWLEDGE_ITEM_INVALID: "That change isn't possible for this item.",
    KNOWLEDGE_ITEM_INVALID_TRANSITION: "The item has moved on; reload to see it.",
    KNOWLEDGE_DOCUMENT_INVALID:
      "Seshat can't use that file (too large, or not available yet).",
    KNOWLEDGE_ITEM_READ_ONLY:
      "This document comes from a repository: change it with a commit there.",
  });

type RepositoryRef = ProjectRef & { linkId: string };

/** Writes an item (a person's is accepted at once), then opens it. */
export async function createKnowledgeItemAction(
  ref: ProjectRef,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireOrganization(
    ref.organizationId,
    knowledgePath(ref),
  );
  const values = valuesOf(form);
  const parsed = newItemOf(values);
  if ("error" in parsed) {
    return { error: parsed.error, values };
  }
  let id: string;
  try {
    id = (
      await createKnowledgeItem(
        session.accessToken,
        ref.organizationId,
        ref.projectId,
        parsed.request,
      )
    ).id;
  } catch (error) {
    return { error: seshatMessageOf(error), values };
  }
  redirect(`${knowledgePath(ref)}/${id}`);
}

/**
 * Uploads a document to Loculus with the person's own token, then registers
 * it with Seshat, which indexes it; then opens it.
 */
export async function uploadKnowledgeDocumentAction(
  ref: ProjectRef,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireOrganization(
    ref.organizationId,
    knowledgePath(ref),
  );
  const values = valuesOf(form);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file.", values };
  }
  if (file.size > DOCUMENT_MAX_BYTES) {
    return { error: "Documents are at most 10 MB.", values };
  }
  let id: string;
  try {
    const uploaded = await uploadFile(
      session.accessToken,
      ref.organizationId,
      ref.projectId,
      {
        fileName: file.name,
        contentType: contentTypeFor(file.type),
        bytes: new Uint8Array(await file.arrayBuffer()),
      },
    );
    const title = (values.title ?? "").trim();
    const tags = tagsOf(values.tags);
    id = (
      await createKnowledgeDocument(
        session.accessToken,
        ref.organizationId,
        ref.projectId,
        {
          fileId: uploaded.id,
          ...(title ? { title } : {}),
          ...(tags.length ? { tags } : {}),
        },
      )
    ).id;
  } catch (error) {
    return { error: seshatMessageOf(error), values };
  }
  redirect(`${knowledgePath(ref)}/${id}`);
}

/** A new version of a written item: its title and body. */
export async function updateKnowledgeItemAction(
  ref: ProjectRef & { itemId: string },
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireOrganization(
    ref.organizationId,
    `${knowledgePath(ref)}/${ref.itemId}`,
  );
  const values = valuesOf(form);
  const title = (values.title ?? "").trim();
  const body = (values.body ?? "").trim();
  if (!title || !body) {
    return { error: "It needs a title and a body.", values };
  }
  try {
    await updateKnowledgeItem(
      session.accessToken,
      ref.organizationId,
      ref.projectId,
      ref.itemId,
      { title, body, tags: tagsOf(values.tags) },
    );
  } catch (error) {
    return { error: seshatMessageOf(error), values };
  }
  refresh();
  return {};
}

/** Accepts or rejects a proposal, or retires an accepted item. */
export async function decideKnowledgeItemAction(
  ref: ProjectRef & {
    itemId: string;
    decision: "accept" | "reject" | "retire";
  },
): Promise<{ error?: string }> {
  const session = await requireOrganization(
    ref.organizationId,
    `${knowledgePath(ref)}/${ref.itemId}`,
  );
  try {
    await decideKnowledgeItem(
      session.accessToken,
      ref.organizationId,
      ref.projectId,
      ref.itemId,
      ref.decision,
    );
  } catch (error) {
    return { error: seshatMessageOf(error) };
  }
  refresh();
  return {};
}

/**
 * Which paths of a linked repository are indexed; starts indexing one
 * that isn't yet (with the paths given).
 */
export async function putKnowledgeRepositoryAction(
  ref: RepositoryRef,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireOrganization(
    ref.organizationId,
    knowledgePath(ref),
  );
  const values = valuesOf(form);
  const parsed = pathsFromText(values.paths);
  if ("error" in parsed) {
    return { error: parsed.error, values };
  }
  try {
    await putKnowledgeRepository(
      session.accessToken,
      ref.organizationId,
      ref.projectId,
      ref.linkId,
      parsed.paths,
    );
  } catch (error) {
    return { error: seshatMessageOf(error), values };
  }
  refresh();
  return {};
}

/** Reads a repository again soon. */
export async function syncKnowledgeRepositoryAction(
  ref: RepositoryRef,
): Promise<{ error?: string }> {
  const session = await requireOrganization(
    ref.organizationId,
    knowledgePath(ref),
  );
  try {
    await syncKnowledgeRepository(
      session.accessToken,
      ref.organizationId,
      ref.projectId,
      ref.linkId,
    );
  } catch (error) {
    return { error: seshatMessageOf(error) };
  }
  refresh();
  return {};
}

/** Stops indexing a repository: its documents are retired. */
export async function deleteKnowledgeRepositoryAction(
  ref: RepositoryRef,
): Promise<{ error?: string }> {
  const session = await requireOrganization(
    ref.organizationId,
    knowledgePath(ref),
  );
  try {
    await deleteKnowledgeRepository(
      session.accessToken,
      ref.organizationId,
      ref.projectId,
      ref.linkId,
    );
  } catch (error) {
    return { error: seshatMessageOf(error) };
  }
  refresh();
  return {};
}
