"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { messageOf } from "@/lib/api/messages";
import {
  addTeamMember,
  archiveTeam,
  createTeam,
  removeTeamMember,
  updateTeam,
} from "@/lib/api/polis";
import { requireAdmin } from "@/lib/auth/current";
import {
  departmentIdsOf,
  textOf,
  valuesOf,
  type FormState,
} from "@/lib/forms";
import { orgPath } from "@/lib/pages";

// Each Server Function checks the person itself: it's its own endpoint.

const teamPath = (organizationId: string, teamId: string) =>
  orgPath(organizationId, `/teams/${teamId}`);

export async function createTeamAction(
  organizationId: string,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const path = orgPath(organizationId, "/teams");
  const { accessToken } = await requireAdmin(organizationId, path);
  let id: string;
  try {
    id = (
      await createTeam(accessToken, organizationId, {
        name: textOf(form, "name"),
        slug: textOf(form, "slug"),
        description: textOf(form, "description"),
        departmentIds: departmentIdsOf(form),
      })
    ).id;
  } catch (error) {
    return { error: messageOf(error), values: valuesOf(form) };
  }
  redirect(`${path}/${id}`);
}

export async function updateTeamAction(
  organizationId: string,
  teamId: string,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const path = teamPath(organizationId, teamId);
  const { accessToken } = await requireAdmin(organizationId, path);
  try {
    await updateTeam(accessToken, organizationId, teamId, {
      name: textOf(form, "name"),
      description: textOf(form, "description"),
      departmentIds: departmentIdsOf(form),
    });
  } catch (error) {
    return { error: messageOf(error), values: valuesOf(form) };
  }
  revalidatePath(path);
  return { saved: true };
}

export async function archiveTeamAction(
  organizationId: string,
  teamId: string,
): Promise<FormState> {
  const path = teamPath(organizationId, teamId);
  const { accessToken } = await requireAdmin(organizationId, path);
  try {
    await archiveTeam(accessToken, organizationId, teamId);
  } catch (error) {
    return { error: messageOf(error) };
  }
  revalidatePath(path);
  return {};
}

export async function addTeamMemberAction(
  organizationId: string,
  teamId: string,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const path = teamPath(organizationId, teamId);
  const { accessToken } = await requireAdmin(organizationId, path);
  const personId = textOf(form, "personId");
  if (!personId) return { error: "Choose someone to add." };
  try {
    await addTeamMember(accessToken, organizationId, teamId, personId);
  } catch (error) {
    return { error: messageOf(error) };
  }
  revalidatePath(path);
  return {};
}

export async function removeTeamMemberAction(
  organizationId: string,
  teamId: string,
  personId: string,
): Promise<FormState> {
  const path = teamPath(organizationId, teamId);
  const { accessToken } = await requireAdmin(organizationId, path);
  try {
    await removeTeamMember(accessToken, organizationId, teamId, personId);
  } catch (error) {
    return { error: messageOf(error) };
  }
  revalidatePath(path);
  return {};
}
