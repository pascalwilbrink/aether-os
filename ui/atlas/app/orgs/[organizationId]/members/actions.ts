"use server";

import { revalidatePath } from "next/cache";

import { messageOf } from "@/lib/api/messages";
import {
  createMembership,
  deleteMembership,
  updateMembership,
} from "@/lib/api/polis";
import { requireAdmin } from "@/lib/auth/current";
import { textOf, type FormState } from "@/lib/forms";
import { isOrganizationRole } from "@/lib/members";
import { orgPath } from "@/lib/pages";

// Each Server Function checks the person itself: it's its own endpoint.
// Polis decides what's allowed (only owners manage owners, the last owner
// stays); these pass its refusals on.

const done = (organizationId: string): FormState => {
  // Members, people and projects all show access.
  revalidatePath(orgPath(organizationId), "layout");
  return {};
};

/** Gives a signed-up person (their user, `subject`) access with one role. */
export async function grantAccessAction(
  organizationId: string,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { accessToken } = await requireAdmin(
    organizationId,
    orgPath(organizationId, "/members"),
  );
  const subject = textOf(form, "subject");
  const role = textOf(form, "role");
  if (!subject) return { error: "Choose someone." };
  if (!isOrganizationRole(role)) return { error: "Choose a role." };
  try {
    await createMembership(accessToken, organizationId, {
      subjectType: "user",
      subject,
      roles: [role],
    });
  } catch (error) {
    return { error: messageOf(error) };
  }
  return done(organizationId);
}

export async function changeRoleAction(
  organizationId: string,
  membershipId: string,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const { accessToken } = await requireAdmin(
    organizationId,
    orgPath(organizationId, "/members"),
  );
  const role = textOf(form, "role");
  if (!isOrganizationRole(role)) return { error: "Choose a role." };
  try {
    await updateMembership(accessToken, organizationId, membershipId, [role]);
  } catch (error) {
    return { error: messageOf(error) };
  }
  return done(organizationId);
}

export async function removeAccessAction(
  organizationId: string,
  membershipId: string,
): Promise<FormState> {
  const { accessToken } = await requireAdmin(
    organizationId,
    orgPath(organizationId, "/members"),
  );
  try {
    await deleteMembership(accessToken, organizationId, membershipId);
  } catch (error) {
    return { error: messageOf(error) };
  }
  return done(organizationId);
}
