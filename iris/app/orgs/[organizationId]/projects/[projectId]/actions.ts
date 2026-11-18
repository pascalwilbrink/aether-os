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
import { messageOf as baseMessageOf } from "@/lib/api/messages";
import { requireOrganization } from "@/lib/auth/current";
import { valuesOf } from "@/lib/forms";

/** What a form shows after a failed submit. */
export interface FormState {
  error?: string;
  /** What was submitted, shown again after a refused submit. */
  values?: Record<string, string>;
}

/** Where a project's pages live. */
export interface ProjectRef {
  organizationId: string;
  projectId: string;
}

const projectPath = ({ organizationId, projectId }: ProjectRef) =>
  `/orgs/${organizationId}/projects/${projectId}`;

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

const messageOf = (error: unknown, byCode: Record<string, string> = {}) =>
  baseMessageOf(error, { FORBIDDEN: "You aren't allowed to do that in this project.", ...byCode });

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
    return { error: messageOf(error), values: valuesOf(form) };
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
    return { error: messageOf(error), values: valuesOf(form) };
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
    return { error: "Say what should change.", values: valuesOf(form) };
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
    return {
      error: messageOf(error, {
        TASK_REVIEW_ROUNDS_EXHAUSTED: "This task has had its review rounds: approve or reject it now.",
      }),
      values: valuesOf(form),
    };
  }
  refresh();
  return {};
}
