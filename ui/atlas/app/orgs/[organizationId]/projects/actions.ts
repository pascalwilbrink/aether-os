"use server";

import { revalidatePath } from "next/cache";

import { messageOf } from "@/lib/api/messages";
import {
  createProjectMembership,
  deleteProjectMembership,
  updateProjectMembership,
} from "@/lib/api/polis";
import { requireAdmin } from "@/lib/auth/current";
import { textOf, type FormState } from "@/lib/forms";
import { isProjectRole } from "@/lib/members";
import { orgPath } from "@/lib/pages";

// Each Server Function checks the person itself: it's its own endpoint.
// Polis caps the role by the organization role (PROJECT_ROLE_EXCEEDS_CAP).

const projectPath = (organizationId: string, projectId: string) =>
  orgPath(organizationId, `/projects/${projectId}`);

export async function grantProjectRoleAction(
  organizationId: string,
  projectId: string,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const path = projectPath(organizationId, projectId);
  const { accessToken } = await requireAdmin(organizationId, path);
  const subject = textOf(form, "subject");
  const role = textOf(form, "role");
  if (!subject) return { error: "Choose someone." };
  if (!isProjectRole(role)) return { error: "Choose a role." };
  try {
    await createProjectMembership(accessToken, organizationId, projectId, {
      subjectType: "user",
      subject,
      role,
    });
  } catch (error) {
    return { error: messageOf(error) };
  }
  revalidatePath(path);
  return {};
}

export async function changeProjectRoleAction(
  organizationId: string,
  projectId: string,
  membershipId: string,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const path = projectPath(organizationId, projectId);
  const { accessToken } = await requireAdmin(organizationId, path);
  const role = textOf(form, "role");
  if (!isProjectRole(role)) return { error: "Choose a role." };
  try {
    await updateProjectMembership(
      accessToken,
      organizationId,
      projectId,
      membershipId,
      role,
    );
  } catch (error) {
    return { error: messageOf(error) };
  }
  revalidatePath(path);
  return {};
}

export async function removeProjectRoleAction(
  organizationId: string,
  projectId: string,
  membershipId: string,
): Promise<FormState> {
  const path = projectPath(organizationId, projectId);
  const { accessToken } = await requireAdmin(organizationId, path);
  try {
    await deleteProjectMembership(
      accessToken,
      organizationId,
      projectId,
      membershipId,
    );
  } catch (error) {
    return { error: messageOf(error) };
  }
  revalidatePath(path);
  return {};
}

