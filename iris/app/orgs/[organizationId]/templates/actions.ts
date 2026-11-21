"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionState } from "@/app/components/action-forms";
import type { TemplateFormState } from "@/app/components/template-form";
import {
  archiveTaskTemplate,
  createTaskTemplate,
  createTaskTemplateVersion,
} from "@/lib/api/hephaestus";
import { messageOf as baseMessageOf } from "@/lib/api/messages";
import { requireOrganization } from "@/lib/auth/current";
import { valuesOf } from "@/lib/forms";
import { templateContentFromForm, templateFieldsOf } from "@/lib/templates";

/** Where a template is: organization-wide, or a project's. */
export interface TemplateScope {
  organizationId: string;
  projectId: string | null;
}

export interface TemplateRef extends TemplateScope {
  templateId: string;
}

/** A template's page: the organization's, or under its project. */
const templatePath = ({
  organizationId,
  projectId,
  templateId,
}: TemplateRef) =>
  projectId
    ? `/orgs/${organizationId}/projects/${projectId}/templates/${templateId}`
    : `/orgs/${organizationId}/templates/${templateId}`;

const messageOf = (error: unknown) =>
  baseMessageOf(error, {
    FORBIDDEN:
      "You aren't allowed to manage templates here (organization templates: owners and admins; a project's: its admins).",
    TASK_TEMPLATE_ARCHIVED:
      "This template is archived: it gets no new versions.",
  });

const fieldsOf = (form: FormData) =>
  templateFieldsOf(
    valuesOf(form),
    form.getAll("context").filter((id): id is string => typeof id === "string"),
  );

/** A new template with its first version, then on to its page. */
export async function createTemplateAction(
  scope: TemplateScope,
  _state: TemplateFormState,
  form: FormData,
): Promise<TemplateFormState> {
  const session = await requireOrganization(
    scope.organizationId,
    scope.projectId
      ? `/orgs/${scope.organizationId}/projects/${scope.projectId}/templates/new`
      : `/orgs/${scope.organizationId}/templates/new`,
  );
  const values = fieldsOf(form);
  const name = (values.name ?? "").trim();
  if (!name) return { error: "Give the template a name.", values };
  const parsed = templateContentFromForm(values);
  if ("error" in parsed) return { error: parsed.error, values };
  let templateId: string;
  try {
    templateId = (
      await createTaskTemplate(session.accessToken, scope.organizationId, {
        ...parsed.content,
        name,
        description: (values.description ?? "").trim(),
        ...(scope.projectId ? { projectId: scope.projectId } : {}),
      })
    ).id;
  } catch (error) {
    return { error: messageOf(error), values };
  }
  redirect(templatePath({ ...scope, templateId }));
}

/** Editing a template: its next version (tasks that pinned earlier ones keep them). */
export async function createTemplateVersionAction(
  ref: TemplateRef,
  _state: TemplateFormState,
  form: FormData,
): Promise<TemplateFormState> {
  const session = await requireOrganization(
    ref.organizationId,
    templatePath(ref),
  );
  const values = fieldsOf(form);
  const parsed = templateContentFromForm(values);
  if ("error" in parsed) return { error: parsed.error, values };
  try {
    const created = await createTaskTemplateVersion(
      session.accessToken,
      ref.organizationId,
      ref.templateId,
      parsed.content,
    );
    refresh();
    return {
      notice: `Version ${created.version} saved: new tasks from it get this version.`,
    };
  } catch (error) {
    return { error: messageOf(error), values };
  }
}

/** No new tasks from it; tasks and templates that pinned a version keep it. */
export async function archiveTemplateAction(
  ref: TemplateRef,
): Promise<ActionState> {
  const session = await requireOrganization(
    ref.organizationId,
    templatePath(ref),
  );
  try {
    await archiveTaskTemplate(
      session.accessToken,
      ref.organizationId,
      ref.templateId,
    );
  } catch (error) {
    return { error: messageOf(error) };
  }
  refresh();
  return {};
}
