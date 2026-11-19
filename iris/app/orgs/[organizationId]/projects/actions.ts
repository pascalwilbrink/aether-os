"use server";

import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api/http";
import { messageOf } from "@/lib/api/messages";
import { createProject } from "@/lib/api/polis";
import { organizationRoles } from "@/lib/auth/claims";
import { requireOrganization } from "@/lib/auth/current";
import { newProjectRequest, type NewProjectFields } from "@/lib/projects";

export interface NewProjectState {
  error?: string;
  /** What was submitted, so the form starts from it after a refusal. */
  values?: NewProjectFields;
}

/**
 * Creates a project (Polis, `project:create`), then opens it. Owners and
 * admins are admins in every project; anyone else has no role in a new
 * project until one is given (Polis doesn't give its creator one), so they
 * go back to the overview, which says so.
 */
export async function createProjectAction(
  organizationId: string,
  _state: NewProjectState,
  form: FormData,
): Promise<NewProjectState> {
  const session = await requireOrganization(organizationId, `/orgs/${organizationId}/projects`);
  const values: NewProjectFields = {
    name: String(form.get("name") ?? ""),
    slug: String(form.get("slug") ?? ""),
    description: String(form.get("description") ?? ""),
  };
  const checked = newProjectRequest(values);
  if ("error" in checked) {
    return { error: checked.error, values };
  }

  let projectId: string;
  try {
    projectId = (await createProject(session.accessToken, organizationId, checked.request)).id;
  } catch (error) {
    if (!(error instanceof ApiError)) {
      return { error: "Polis can't be reached right now. Try again later.", values };
    }
    return {
      error: messageOf(error, {
        PROJECT_SLUG_TAKEN: "Another project of the organization has that slug.",
        ORGANIZATION_SUSPENDED: "The organization is suspended.",
        FORBIDDEN: "Viewers can't create projects.",
      }),
      values,
    };
  }
  const roles = organizationRoles(session.accessToken);
  redirect(
    roles.includes("owner") || roles.includes("admin")
      ? `/orgs/${organizationId}/projects/${projectId}`
      : `/orgs/${organizationId}/projects?created=1`,
  );
}
