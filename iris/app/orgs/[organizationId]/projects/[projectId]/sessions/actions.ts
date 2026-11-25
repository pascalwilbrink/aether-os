"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionState } from "@/app/components/action-forms";
import {
  createSession,
  decideCouncilPlan,
  endSession,
  getSession,
  setSessionMode,
  type PlanDecision,
} from "@/lib/api/hephaestus";
import { messageOf } from "@/lib/api/messages";
import { requireOrganization } from "@/lib/auth/current";
import { valuesOf } from "@/lib/forms";
import { changedAssignments } from "@/lib/plans";

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
    SESSION_BUSY: "The council is answering: switch when it's done.",
    SESSION_ENDED: "This session has ended.",
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

/** Switches a council session's mode (`role` in the picker's form). */
export async function setSessionModeAction(
  ref: ProjectRef & { sessionId: string },
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await requireOrganization(
    ref.organizationId,
    `${sessionsPath(ref)}/${ref.sessionId}`,
  );
  const mode = String(form.get("role") ?? "");
  if (!["direct", "facilitated", "discussion", "planning", "delegation"].includes(mode)) {
    return { error: "Choose a way of working." };
  }
  try {
    await setSessionMode(
      session.accessToken,
      ref.organizationId,
      ref.projectId,
      ref.sessionId,
      mode as Parameters<typeof setSessionMode>[4],
    );
  } catch (error) {
    return { error: sessionMessageOf(error) };
  }
  refresh();
  return {};
}

/**
 * Decides on a council's proposed plan (`decision` from the button):
 * approving takes the service account its tasks run as and the entries the
 * person gave to other members (`agent:<entry key>`); requesting changes
 * needs a comment.
 */
export async function decidePlanAction(
  ref: ProjectRef & {
    sessionId: string;
    planId: string;
    entries: { key: string; agentId: string }[];
  },
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireOrganization(
    ref.organizationId,
    `${sessionsPath(ref)}/${ref.sessionId}`,
  );
  const values = valuesOf(form);
  const decision = values.decision as PlanDecision;
  if (!["approve", "reject", "request-changes"].includes(decision)) {
    return { error: "Choose what to do with the plan.", values };
  }
  const comment = values.comment?.trim() ?? "";
  if (decision === "request-changes" && !comment) {
    return { error: "Say what should change.", values };
  }
  const serviceAccountId = values.serviceAccountId ?? "";
  try {
    let body: Parameters<typeof decideCouncilPlan>[6];
    if (decision === "approve") {
      if (!serviceAccountId) {
        return { error: "Choose the service account its tasks run as.", values };
      }
      // Members of the session only: Hephaestus checks again.
      const { members } = await getSession(
        session.accessToken,
        ref.organizationId,
        ref.projectId,
        ref.sessionId,
      );
      const assignments = changedAssignments(
        { entries: ref.entries },
        members.map((member) => member.agentId),
        values,
      );
      body = { serviceAccountId, ...(assignments.length > 0 ? { assignments } : {}) };
    } else {
      body = comment ? { comment } : {};
    }
    await decideCouncilPlan(
      session.accessToken,
      ref.organizationId,
      ref.projectId,
      ref.sessionId,
      ref.planId,
      decision,
      body,
    );
  } catch (error) {
    return {
      error: messageOf(error, {
        FORBIDDEN: "Deciding on plans needs the approver or admin role in this project.",
        PLAN_NOT_PROPOSED: "This plan has been decided on, or replaced by a newer one.",
        PLAN_ASSIGNMENT_INVALID: "An entry can only go to a member of the council.",
        AGENT_NOT_PUBLISHED: "One of the plan's agents has no published version now.",
        AGENT_ARCHIVED: "One of the plan's agents is archived.",
        PROJECT_ARCHIVED: "The project is archived.",
        ORGANIZATION_SUSPENDED: "The organization is suspended.",
      }),
      values,
    };
  }
  refresh();
  return {};
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
