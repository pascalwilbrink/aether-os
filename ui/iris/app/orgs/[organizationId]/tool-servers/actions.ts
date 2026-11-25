"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionState } from "@/app/components/action-forms";
import type { KeyFormState } from "@/app/components/model-key-form";
import {
  createToolServer,
  deleteToolServer,
  deleteToolServerCredential,
  setToolServerCredential,
  updateToolServer,
} from "@/lib/api/hephaestus";
import { ApiError } from "@/lib/api/http";
import { messageOf } from "@/lib/api/messages";
import { requireOrganization } from "@/lib/auth/current";
import { valuesOf } from "@/lib/forms";
import { toolServerFromForm } from "@/lib/tool-servers";

/** What the tool server forms show after a submit. */
export interface ToolServerFormState {
  error?: string;
  notice?: string;
  values?: Record<string, string>;
}

export interface ToolServerRef {
  organizationId: string;
  toolServerId: string;
}

const listPath = (organizationId: string) =>
  `/orgs/${organizationId}/tool-servers`;
const serverPath = ({ organizationId, toolServerId }: ToolServerRef) =>
  `${listPath(organizationId)}/${toolServerId}`;

function toolServerMessageOf(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Hephaestus can't be reached right now. Try again in a moment.";
  }
  if (error.status === 503) {
    // Hephaestus says why (OpenBao, or the tool server).
    return (
      error.message || "That can't be done right now. Try again in a moment."
    );
  }
  return messageOf(error, {
    FORBIDDEN:
      "Only the organization's owners and admins manage tool servers and their credentials.",
    ORGANIZATION_SUSPENDED: "The organization is suspended.",
  });
}

/** Registers a tool server (`org:manage`), then opens it. */
export async function createToolServerAction(
  organizationId: string,
  _state: ToolServerFormState,
  form: FormData,
): Promise<ToolServerFormState> {
  const session = await requireOrganization(
    organizationId,
    listPath(organizationId),
  );
  const fields = valuesOf(form);
  const result = toolServerFromForm(fields, { creating: true });
  if ("error" in result) return { error: result.error, values: fields };
  let toolServerId: string;
  try {
    toolServerId = (
      await createToolServer(session.accessToken, organizationId, result.body)
    ).id;
  } catch (error) {
    return { error: toolServerMessageOf(error), values: fields };
  }
  redirect(serverPath({ organizationId, toolServerId }));
}

/** Changes its description, URL or authentication (the name stays). */
export async function updateToolServerAction(
  ref: ToolServerRef,
  _state: ToolServerFormState,
  form: FormData,
): Promise<ToolServerFormState> {
  const session = await requireOrganization(
    ref.organizationId,
    serverPath(ref),
  );
  const fields = valuesOf(form);
  const result = toolServerFromForm(fields, { creating: false });
  if ("error" in result) return { error: result.error, values: fields };
  const { description, url, auth } = result.body;
  try {
    const updated = await updateToolServer(
      session.accessToken,
      ref.organizationId,
      ref.toolServerId,
      {
        description: description ?? "",
        url,
        auth,
      },
    );
    refresh();
    return {
      notice:
        auth.type === "header" && !updated.credential
          ? "Saved. Set its credential below: a new URL or authentication removes the old one."
          : "Saved.",
    };
  } catch (error) {
    return { error: toolServerMessageOf(error), values: fields };
  }
}

/** Removes it and its credential. */
export async function deleteToolServerAction(
  ref: ToolServerRef,
): Promise<ActionState> {
  const session = await requireOrganization(
    ref.organizationId,
    serverPath(ref),
  );
  try {
    await deleteToolServer(
      session.accessToken,
      ref.organizationId,
      ref.toolServerId,
    );
  } catch (error) {
    return { error: toolServerMessageOf(error) };
  }
  redirect(listPath(ref.organizationId));
}

/** Stores (or replaces) its credential (`org:secret:write`); never shown again. */
export async function setCredentialAction(
  ref: ToolServerRef,
  _state: KeyFormState,
  form: FormData,
): Promise<KeyFormState> {
  const session = await requireOrganization(
    ref.organizationId,
    serverPath(ref),
  );
  const value = String(form.get("apiKey") ?? "").trim();
  if (value.length < 8) {
    return {
      error:
        "Paste the whole credential (with “Bearer ” for an Authorization header).",
    };
  }
  try {
    await setToolServerCredential(
      session.accessToken,
      ref.organizationId,
      ref.toolServerId,
      value,
    );
  } catch (error) {
    return { error: toolServerMessageOf(error) };
  }
  refresh();
  return {
    notice:
      "Saved. The credential is stored securely and won't be shown again.",
  };
}

export async function deleteCredentialAction(
  ref: ToolServerRef,
): Promise<ActionState> {
  const session = await requireOrganization(
    ref.organizationId,
    serverPath(ref),
  );
  try {
    await deleteToolServerCredential(
      session.accessToken,
      ref.organizationId,
      ref.toolServerId,
    );
  } catch (error) {
    return { error: toolServerMessageOf(error) };
  }
  refresh();
  return {};
}
