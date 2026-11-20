"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { versionFromForm } from "@/lib/agents";
import {
  archiveAgent,
  createAgent,
  createAgentVersion,
  publishAgentVersion,
} from "@/lib/api/hephaestus";
import { messageOf as baseMessageOf } from "@/lib/api/messages";
import { requireOrganization } from "@/lib/auth/current";
import { valuesOf } from "@/lib/forms";

/** What a form shows after a submit. */
export interface FormState {
  error?: string;
  notice?: string;
  /** What was submitted, so a refused form shows it again (React resets forms after an action). */
  values?: Record<string, string>;
}

/** Where an agent's page lives. */
export interface AgentRef {
  organizationId: string;
  agentId: string;
}

const agentPath = ({ organizationId, agentId }: AgentRef) =>
  `/orgs/${organizationId}/agents/${agentId}`;

const text = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();

const messageOf = (error: unknown) =>
  baseMessageOf(error, {
    FORBIDDEN:
      "You aren't allowed to do that with agents in this organization.",
    AGENT_ARCHIVED: "This agent is archived: it can't get new versions.",
    AGENT_VERSION_INVALID_TRANSITION: "Only a draft can be published.",
    AGENT_VERSION_CONFLICT:
      "Someone changed this agent at the same time. Try again.",
  });

/** Creates an agent (`agent:write`), then opens it to write its first version. */
export async function createAgentAction(
  organizationId: string,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireOrganization(
    organizationId,
    `/orgs/${organizationId}/agents/new`,
  );
  const name = text(form, "name");
  if (!name) {
    return { error: "Give the agent a name.", values: valuesOf(form) };
  }
  let agentId: string;
  try {
    agentId = (
      await createAgent(session.accessToken, organizationId, {
        name,
        description: text(form, "description"),
      })
    ).id;
  } catch (error) {
    return { error: messageOf(error), values: valuesOf(form) };
  }
  redirect(agentPath({ organizationId, agentId }));
}

/**
 * A new version (versions never change: editing is a new one), published
 * at once when asked and allowed (`agent:publish`).
 */
export async function createVersionAction(
  ref: AgentRef,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireOrganization(ref.organizationId, agentPath(ref));
  const fields = valuesOf(form);
  const result = versionFromForm(fields);
  if ("error" in result) {
    return { error: result.error, values: fields };
  }
  let version: number;
  try {
    const created = await createAgentVersion(
      session.accessToken,
      ref.organizationId,
      ref.agentId,
      result.body,
    );
    version = created.version;
    if (form.get("publish") === "on") {
      try {
        await publishAgentVersion(
          session.accessToken,
          ref.organizationId,
          ref.agentId,
          created.id,
        );
      } catch (error) {
        refresh();
        return {
          error: `Version ${version} was saved as a draft, but not published: ${messageOf(error)}`,
        };
      }
    }
  } catch (error) {
    return { error: messageOf(error), values: fields };
  }
  refresh();
  return {
    notice:
      form.get("publish") === "on"
        ? `Version ${version} is published.`
        : `Version ${version} saved.`,
  };
}

/** Publishes a draft; the published one before it becomes deprecated. */
export async function publishVersionAction(
  ref: AgentRef & { versionId: string },
): Promise<FormState> {
  const session = await requireOrganization(ref.organizationId, agentPath(ref));
  try {
    await publishAgentVersion(
      session.accessToken,
      ref.organizationId,
      ref.agentId,
      ref.versionId,
    );
  } catch (error) {
    return { error: messageOf(error) };
  }
  refresh();
  return {};
}

/** Archives the agent: no new versions or tasks; existing tasks keep their version. */
export async function archiveAgentAction(ref: AgentRef): Promise<FormState> {
  const session = await requireOrganization(ref.organizationId, agentPath(ref));
  try {
    await archiveAgent(session.accessToken, ref.organizationId, ref.agentId);
  } catch (error) {
    return { error: messageOf(error) };
  }
  refresh();
  return {};
}
