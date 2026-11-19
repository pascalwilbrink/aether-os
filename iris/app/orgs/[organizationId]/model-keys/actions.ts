"use server";

import { refresh } from "next/cache";

import type { KeyFormState } from "@/app/components/model-key-form";
import { deleteModelKey, setModelKey } from "@/lib/api/hephaestus";
import { ApiError } from "@/lib/api/http";
import { messageOf } from "@/lib/api/messages";
import { requireOrganization } from "@/lib/auth/current";
import { isProvider } from "@/lib/model-keys";

/** Where the key goes: the organization's, or an agent's own. */
export interface KeyRef {
  organizationId: string;
  provider: string;
  agentId?: string;
}

const pathOf = ({ organizationId, agentId }: KeyRef) =>
  agentId ? `/orgs/${organizationId}/agents/${agentId}` : `/orgs/${organizationId}/model-keys`;

function keyMessageOf(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Hephaestus can't be reached right now. Try again in a moment.";
  }
  if (error.status === 503) {
    // Hephaestus says why: OpenBao not configured, refusing its token, or not answering.
    return error.message || "Keys can't be stored right now. Try again in a moment.";
  }
  return messageOf(error, {
    FORBIDDEN: "Only the organization's owners and admins set provider keys.",
    ORGANIZATION_SUSPENDED: "The organization is suspended.",
  });
}

/** Stores (or replaces) a provider key; it's never shown again. */
export async function setModelKeyAction(ref: KeyRef, _state: KeyFormState, form: FormData): Promise<KeyFormState> {
  const session = await requireOrganization(ref.organizationId, pathOf(ref));
  const apiKey = String(form.get("apiKey") ?? "").trim();
  if (!isProvider(ref.provider)) {
    return { error: "Unknown provider." };
  }
  if (apiKey.length < 8) {
    return { error: "Paste the whole API key." };
  }
  try {
    await setModelKey(session.accessToken, ref.organizationId, ref.provider, apiKey, ref.agentId);
  } catch (error) {
    return { error: keyMessageOf(error) };
  }
  refresh();
  return { notice: "Saved. The key is stored securely and won't be shown again." };
}

/** Removes a provider key. */
export async function deleteModelKeyAction(ref: KeyRef): Promise<{ error?: string }> {
  const session = await requireOrganization(ref.organizationId, pathOf(ref));
  try {
    await deleteModelKey(session.accessToken, ref.organizationId, ref.provider, ref.agentId);
  } catch (error) {
    return { error: keyMessageOf(error) };
  }
  refresh();
  return {};
}
