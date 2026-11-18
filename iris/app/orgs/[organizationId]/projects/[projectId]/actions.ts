"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import type { ApiSchema } from "@/lib/api";
import {
  cancelTask,
  createTask,
  createTaskFromTemplate,
  retryTask,
  reviewArtifact,
  type ReviewDecision,
} from "@/lib/api/hephaestus";
import { ApiError } from "@/lib/api/http";
import { requireOrganization } from "@/lib/auth/current";

/** What a form shows after a failed submit. */
export interface FormState {
  error?: string;
}

/** Where a project's pages live. */
export interface ProjectRef {
  organizationId: string;
  projectId: string;
}

const projectPath = ({ organizationId, projectId }: ProjectRef) =>
  `/orgs/${organizationId}/projects/${projectId}`;

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

/** A message for people from an API error; anything else is thrown on. */
function messageOf(error: unknown): string {
  if (!(error instanceof ApiError)) {
    throw error;
  }
  if (error.status === 403) {
    return "You aren't allowed to do that in this project.";
  }
  if (error.status === 400) {
    return "Some fields aren't valid. Check them and try again.";
  }
  return error.message;
}

/**
 * Creates a task, then opens it. Every Server Function checks the session
 * itself: it's an endpoint of its own. The idempotency key comes from the
 * rendered form, so a double submit gives the same task.
 */
export async function createTaskAction(ref: ProjectRef, _state: FormState, form: FormData): Promise<FormState> {
  const session = await requireOrganization(ref.organizationId, projectPath(ref));
  let taskId: string;
  try {
    taskId = (
      await createTask(
        session.accessToken,
        ref.organizationId,
        ref.projectId,
        {
          title: text(form, "title"),
          instructions: text(form, "instructions"),
          agentId: text(form, "agentId"),
          serviceAccountId: text(form, "serviceAccountId"),
          review: { artifactKinds: form.get("review") === "all" ? ["*"] : [] },
        },
        text(form, "idempotencyKey"),
      )
    ).id;
  } catch (error) {
    return { error: messageOf(error) };
  }
  redirect(`${projectPath(ref)}/tasks/${taskId}`);
}

/** Creates a task from a template version, with its inputs. */
export async function createTaskFromTemplateAction(
  ref: ProjectRef & { templateId: string; version: number },
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireOrganization(ref.organizationId, projectPath(ref));
  const inputs: Record<string, string> = {};
  for (const [name, value] of form.entries()) {
    if (name.startsWith("input:") && String(value).trim()) {
      inputs[name.slice("input:".length)] = String(value).trim();
    }
  }
  const body: ApiSchema<"CreateTaskFromTemplateRequest"> = {
    version: ref.version,
    inputs,
    serviceAccountId: text(form, "serviceAccountId"),
  };
  let taskId: string;
  try {
    taskId = (
      await createTaskFromTemplate(
        session.accessToken,
        ref.organizationId,
        ref.projectId,
        ref.templateId,
        body,
        text(form, "idempotencyKey"),
      )
    ).id;
  } catch (error) {
    return { error: messageOf(error) };
  }
  redirect(`${projectPath(ref)}/tasks/${taskId}`);
}

/** Cancels a task (and everything under it), or retries a failed one. */
export async function taskAction(
  ref: ProjectRef & { taskId: string; action: "cancel" | "retry" },
): Promise<FormState> {
  const session = await requireOrganization(ref.organizationId, projectPath(ref));
  try {
    await (ref.action === "cancel" ? cancelTask : retryTask)(
      session.accessToken,
      ref.organizationId,
      ref.projectId,
      ref.taskId,
    );
  } catch (error) {
    return { error: messageOf(error) };
  }
  refresh();
  return {};
}

/** Approves, rejects or sends back a draft (`task:approve`). */
export async function reviewAction(
  ref: ProjectRef & { taskId: string; artifactId: string },
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireOrganization(ref.organizationId, projectPath(ref));
  const decision = text(form, "decision") as ReviewDecision;
  const comment = text(form, "comment");
  if (decision === "request-changes" && !comment) {
    return { error: "Say what should change." };
  }
  try {
    await reviewArtifact(
      session.accessToken,
      ref.organizationId,
      ref.projectId,
      ref.taskId,
      ref.artifactId,
      decision,
      decision === "request-changes" ? { comments: [{ body: comment }] } : comment ? { comment } : {},
    );
  } catch (error) {
    if (error instanceof ApiError && error.code === "TASK_REVIEW_ROUNDS_EXHAUSTED") {
      return { error: "This task has had its review rounds: approve or reject it now." };
    }
    return { error: messageOf(error) };
  }
  refresh();
  return {};
}
