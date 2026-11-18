"use server";

import { refresh } from "next/cache";

import type { ActionState } from "@/app/components/action-forms";
import { messageOf as baseMessageOf } from "@/lib/api/messages";
import { createServiceAccount, setServiceAccountEnabled } from "@/lib/api/pistis";
import { createMembership, deleteMembership, updateMembership } from "@/lib/api/polis";
import { requireOrganization } from "@/lib/auth/current";
import { valuesOf } from "@/lib/forms";
import { isOrganizationRole, roleLabel } from "@/lib/members";

/** What the new-service-account form shows after a submit. */
export interface FormState extends ActionState {
  notice?: string;
  values?: Record<string, string>;
}

const membersPath = (organizationId: string) => `/orgs/${organizationId}/members`;

const messageOf = (error: unknown) =>
  baseMessageOf(error, {
    FORBIDDEN: "You aren't allowed to do that. Only owners give the owner role, or change or remove an owner.",
    MEMBERSHIP_EXISTS: "They're already a member.",
    ORGANIZATION_SUSPENDED: "The organization is suspended: nothing can change until it's active again.",
  });

/** Replaces a member's organization roles with one role (`member:manage`). */
export async function changeRoleAction(
  ref: { organizationId: string; membershipId: string },
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await requireOrganization(ref.organizationId, membersPath(ref.organizationId));
  const role = form.get("role");
  if (!isOrganizationRole(role)) {
    return { error: "Choose a role." };
  }
  try {
    await updateMembership(session.accessToken, ref.organizationId, ref.membershipId, [role]);
  } catch (error) {
    return { error: messageOf(error) };
  }
  refresh();
  return {};
}

/** Removes someone from the organization; Polis removes their project roles too. */
export async function removeMemberAction(ref: { organizationId: string; membershipId: string }): Promise<ActionState> {
  const session = await requireOrganization(ref.organizationId, membersPath(ref.organizationId));
  try {
    await deleteMembership(session.accessToken, ref.organizationId, ref.membershipId);
  } catch (error) {
    return { error: messageOf(error) };
  }
  refresh();
  return {};
}

/** Gives a service account an organization role (its first membership). */
export async function grantServiceAccountAction(
  ref: { organizationId: string; serviceAccountId: string },
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await requireOrganization(ref.organizationId, membersPath(ref.organizationId));
  const role = form.get("role");
  if (!isOrganizationRole(role)) {
    return { error: "Choose a role." };
  }
  try {
    await createMembership(session.accessToken, ref.organizationId, {
      subjectType: "service_account",
      subject: ref.serviceAccountId,
      roles: [role],
    });
  } catch (error) {
    return { error: messageOf(error) };
  }
  refresh();
  return {};
}

/** Disables a service account (its keys and tokens stop working), or enables it again. */
export async function setServiceAccountEnabledAction(ref: {
  organizationId: string;
  serviceAccountId: string;
  enabled: boolean;
}): Promise<ActionState> {
  const session = await requireOrganization(ref.organizationId, membersPath(ref.organizationId));
  try {
    await setServiceAccountEnabled(session.accessToken, ref.organizationId, ref.serviceAccountId, ref.enabled);
  } catch (error) {
    return { error: messageOf(error) };
  }
  refresh();
  return {};
}

/**
 * A new service account (Pistis) with an organization role (Polis): two
 * calls, so a refused role leaves the account without one, which the page
 * shows with a way to grant it.
 */
export async function createServiceAccountAction(
  organizationId: string,
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireOrganization(organizationId, membersPath(organizationId));
  const values = valuesOf(form);
  const name = (values.name ?? "").trim();
  const role = values.role;
  if (!name) {
    return { error: "Give it a name.", values };
  }
  if (!isOrganizationRole(role)) {
    return { error: "Choose a role.", values };
  }
  let accountId: string;
  try {
    accountId = (
      await createServiceAccount(session.accessToken, organizationId, {
        name,
        description: (values.description ?? "").trim(),
      })
    ).id;
  } catch (error) {
    return { error: messageOf(error), values };
  }
  try {
    await createMembership(session.accessToken, organizationId, {
      subjectType: "service_account",
      subject: accountId,
      roles: [role],
    });
  } catch (error) {
    refresh();
    return { error: `${name} was created, but without a role: ${messageOf(error)}` };
  }
  refresh();
  return {
    notice: `${name} is in the organization (${roleLabel(role)}). Give it a role in a project to run tasks there.`,
  };
}
