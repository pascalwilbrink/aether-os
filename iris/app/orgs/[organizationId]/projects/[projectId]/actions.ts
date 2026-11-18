"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import type { BudgetFormState } from "@/app/components/budget";
import type { ApiSchema } from "@/lib/api";
import {
  cancelTask,
  createTask,
  createTaskFromTemplate,
  retryTask,
  reviewArtifact,
  setProjectBudget,
  setTaskTreeBudget,
  type ReviewDecision,
} from "@/lib/api/hephaestus";
import { ApiError } from "@/lib/api/http";
import { messageOf as baseMessageOf } from "@/lib/api/messages";
import { createProjectMembership, deleteProjectMembership, updateProjectMembership } from "@/lib/api/polis";
import { linkRepository, unlinkRepository } from "@/lib/api/proxenos";
import { requireOrganization } from "@/lib/auth/current";
import { parseLimit } from "@/lib/budgets";
import { valuesOf } from "@/lib/forms";
import { isProjectRole } from "@/lib/members";

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

const projectPath = ({ organizationId, projectId }: ProjectRef) => `/orgs/${organizationId}/projects/${projectId}`;

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
  const budget = parseLimit(text(form, "budgetUsd"));
  if ("error" in budget) {
    return { error: budget.error, values: valuesOf(form) };
  }
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
          ...repositoryOf(form),
          ...(budget.limitUsd === null ? {} : { budgetUsd: budget.limitUsd }),
        },
        text(form, "idempotencyKey"),
      )
    ).id;
  } catch (error) {
    return { error: messageOf(error), values: valuesOf(form) };
  }
  redirect(`${projectPath(ref)}/tasks/${taskId}`);
}

/** The repository link a task works in (`repositoryLinkId`), when one was chosen. */
const repositoryOf = (form: FormData) => {
  const linkId = text(form, "repositoryLinkId");
  return linkId ? { repository: { linkId } } : {};
};

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
    ...repositoryOf(form),
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
export async function taskAction(ref: ProjectRef & { taskId: string; action: "cancel" | "retry" }): Promise<FormState> {
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

// --- Who has a role in the project (`project-member:manage`: organization owners and admins) ---

const accessMessageOf = (error: unknown) =>
  messageOf(error, {
    FORBIDDEN: "Only the organization's owners and admins manage who works in a project.",
    PROJECT_MEMBERSHIP_EXISTS: "They already have a role here.",
    PROJECT_MEMBER_NOT_IN_ORGANIZATION: "They aren't a member of the organization any more.",
    PROJECT_ROLE_EXCEEDS_CAP:
      "Their organization role doesn't allow that (viewers only view; service accounts never approve).",
    PROJECT_ARCHIVED: "The project is archived.",
  });

/** Gives a member (`member` = `<subjectType>:<subject>`) a role in the project. */
export async function grantProjectRoleAction(ref: ProjectRef, _state: FormState, form: FormData): Promise<FormState> {
  const session = await requireOrganization(ref.organizationId, projectPath(ref));
  const member = text(form, "member");
  const subjectType = member.slice(0, member.indexOf(":"));
  const subject = member.slice(member.indexOf(":") + 1);
  const role = form.get("role");
  if ((subjectType !== "user" && subjectType !== "service_account") || !subject) {
    return { error: "Choose who.", values: valuesOf(form) };
  }
  if (!isProjectRole(role)) {
    return { error: "Choose a role.", values: valuesOf(form) };
  }
  try {
    await createProjectMembership(session.accessToken, ref.organizationId, ref.projectId, {
      subjectType,
      subject,
      role,
    });
  } catch (error) {
    return { error: accessMessageOf(error), values: valuesOf(form) };
  }
  refresh();
  return {};
}

export async function changeProjectRoleAction(
  ref: ProjectRef & { membershipId: string },
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireOrganization(ref.organizationId, projectPath(ref));
  const role = form.get("role");
  if (!isProjectRole(role)) {
    return { error: "Choose a role." };
  }
  try {
    await updateProjectMembership(session.accessToken, ref.organizationId, ref.projectId, ref.membershipId, role);
  } catch (error) {
    return { error: accessMessageOf(error) };
  }
  refresh();
  return {};
}

export async function removeProjectRoleAction(ref: ProjectRef & { membershipId: string }): Promise<FormState> {
  const session = await requireOrganization(ref.organizationId, projectPath(ref));
  try {
    await deleteProjectMembership(session.accessToken, ref.organizationId, ref.projectId, ref.membershipId);
  } catch (error) {
    return { error: accessMessageOf(error) };
  }
  refresh();
  return {};
}

// --- The project's repositories (Proxenos; `project:manage` to change them) ---

function repositoryMessageOf(error: unknown): string {
  if (!(error instanceof ApiError) || error.status >= 500) {
    return "GitHub connections can't be changed right now. Try again later.";
  }
  return messageOf(error, {
    FORBIDDEN: "Only the project's admins link and unlink repositories.",
    REPOSITORY_ALREADY_LINKED: "That repository is linked to this project already.",
    REPOSITORY_UNAVAILABLE: "The GitHub App doesn't cover that repository any more. Sync on the GitHub page.",
    INSTALLATION_NOT_ACTIVE: "That repository's GitHub installation is suspended or uninstalled.",
    PROJECT_ARCHIVED: "The project is archived.",
    ORGANIZATION_SUSPENDED: "The organization is suspended.",
  });
}

/** Links one of the organization's repositories to the project. */
export async function linkRepositoryAction(ref: ProjectRef, _state: FormState, form: FormData): Promise<FormState> {
  const session = await requireOrganization(ref.organizationId, projectPath(ref));
  const repositoryId = text(form, "repositoryId");
  if (!repositoryId) {
    return { error: "Choose a repository." };
  }
  try {
    await linkRepository(session.accessToken, ref.organizationId, ref.projectId, repositoryId);
  } catch (error) {
    return { error: repositoryMessageOf(error), values: valuesOf(form) };
  }
  refresh();
  return {};
}

/** Unlinks a repository: new tasks can't use it; running ones keep their checkout. */
export async function unlinkRepositoryAction(ref: ProjectRef & { linkId: string }): Promise<FormState> {
  const session = await requireOrganization(ref.organizationId, projectPath(ref));
  try {
    await unlinkRepository(session.accessToken, ref.organizationId, ref.projectId, ref.linkId);
  } catch (error) {
    return { error: repositoryMessageOf(error) };
  }
  refresh();
  return {};
}

// --- Budgets: the project's monthly limit (`project:manage`), a task tree's (`task:create`) ---

const budgetMessageOf = (error: unknown, forbidden: string) =>
  messageOf(error, {
    FORBIDDEN: forbidden,
    PROJECT_ARCHIVED: "The project is archived.",
    ORGANIZATION_SUSPENDED: "The organization is suspended.",
  });

/** Sets (or removes) the project's monthly limit. */
export async function setProjectBudgetAction(
  ref: ProjectRef,
  _state: BudgetFormState,
  form: FormData,
): Promise<BudgetFormState> {
  const session = await requireOrganization(ref.organizationId, projectPath(ref));
  const limit = String(form.get("limit") ?? "");
  const parsed = parseLimit(limit);
  if ("error" in parsed) {
    return { error: parsed.error, limit };
  }
  try {
    await setProjectBudget(session.accessToken, ref.organizationId, ref.projectId, parsed.limitUsd);
  } catch (error) {
    return { error: budgetMessageOf(error, "Only the project's admins set its budget."), limit };
  }
  refresh();
  return { notice: parsed.limitUsd === null ? "The limit is removed." : "Saved." };
}

/** Sets (or removes) the limit of a task's tree; its paused tasks resume once it has room. */
export async function setTaskBudgetAction(
  ref: ProjectRef & { taskId: string },
  _state: BudgetFormState,
  form: FormData,
): Promise<BudgetFormState> {
  const session = await requireOrganization(ref.organizationId, projectPath(ref));
  const limit = String(form.get("limit") ?? "");
  const parsed = parseLimit(limit);
  if ("error" in parsed) {
    return { error: parsed.error, limit };
  }
  try {
    await setTaskTreeBudget(session.accessToken, ref.organizationId, ref.projectId, ref.taskId, parsed.limitUsd);
  } catch (error) {
    return { error: budgetMessageOf(error, "You can't change this task's budget."), limit };
  }
  refresh();
  return { notice: parsed.limitUsd === null ? "The limit is removed." : "Saved." };
}
