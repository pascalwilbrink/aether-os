"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionState } from "@/app/components/action-forms";
import { createSession, endSession } from "@/lib/api/hephaestus";
import { messageOf } from "@/lib/api/messages";
import { requireOrganization } from "@/lib/auth/current";
import { valuesOf } from "@/lib/forms";

import type { FormState, ProjectRef } from "../actions";

const sessionsPath = ({ organizationId, projectId }: ProjectRef) =>
  `/orgs/${organizationId}/projects/${projectId}/sessions`;

const sessionMessageOf = (error: unknown) =>
  messageOf(error, {
    FORBIDDEN: "Your role in this project doesn't allow sessions.",
    AGENT_NOT_PUBLISHED:
      "That agent (or one of the council's agents) has no published version yet.",
    AGENT_ARCHIVED: "That agent (or one of the council's agents) is archived.",
    COUNCIL_UNAVAILABLE: "That council is archived or has no published version.",
    PROJECT_ARCHIVED: "The project is archived.",
    ORGANIZATION_SUSPENDED: "The organization is suspended.",
  });

/** Starts a session with an agent or a council (`subject` is `agent:<id>` or `council:<id>`), then opens it. */
export async function createSessionAction(
  ref: ProjectRef,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireOrganization(ref.organizationId, sessionsPath(ref));
  const values = valuesOf(form);
  const [kind, id] = (values.subject ?? "").split(":");
  if (!id || (kind !== "agent" && kind !== "council")) {
    return { error: "Choose an agent or a council to talk to.", values };
  }
  const title = values.title?.trim();
  let sessionId: string;
  try {
    sessionId = (
      await createSession(session.accessToken, ref.organizationId, ref.projectId, {
        ...(kind === "agent" ? { agentId: id } : { councilId: id }),
        ...(title ? { title } : {}),
      })
    ).id;
  } catch (error) {
    return { error: sessionMessageOf(error), values };
  }
  redirect(`${sessionsPath(ref)}/${sessionId}`);
}

/** Ends the session; its conversation stays. */
export async function endSessionAction(
  ref: ProjectRef & { sessionId: string },
): Promise<ActionState> {
  const session = await requireOrganization(
    ref.organizationId,
    `${sessionsPath(ref)}/${ref.sessionId}`,
  );
  try {
    await endSession(session.accessToken, ref.organizationId, ref.projectId, ref.sessionId);
  } catch (error) {
    return { error: sessionMessageOf(error) };
  }
  refresh();
  return {};
}
