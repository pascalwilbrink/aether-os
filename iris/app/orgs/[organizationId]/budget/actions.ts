"use server";

import { refresh } from "next/cache";

import type { BudgetFormState } from "@/app/components/budget";
import { setAgentBudget, setOrganizationBudget } from "@/lib/api/hephaestus";
import { messageOf } from "@/lib/api/messages";
import { requireOrganization } from "@/lib/auth/current";
import { parseLimit } from "@/lib/budgets";

/** Sets (or removes) the organization's monthly limit (`org:manage`). */
export async function setOrganizationBudgetAction(
  organizationId: string,
  _state: BudgetFormState,
  form: FormData,
): Promise<BudgetFormState> {
  const session = await requireOrganization(organizationId, `/orgs/${organizationId}/budget`);
  const limit = String(form.get("limit") ?? "");
  const parsed = parseLimit(limit);
  if ("error" in parsed) {
    return { error: parsed.error, limit };
  }
  try {
    await setOrganizationBudget(session.accessToken, organizationId, parsed.limitUsd);
  } catch (error) {
    return {
      error: messageOf(error, {
        FORBIDDEN: "Only the organization's owners and admins set its budget.",
        ORGANIZATION_SUSPENDED: "The organization is suspended.",
      }),
      limit,
    };
  }
  refresh();
  return { notice: parsed.limitUsd === null ? "The limit is removed." : "Saved." };
}

/** Sets (or removes) an agent's monthly limit, over all its projects (`org:manage`). */
export async function setAgentBudgetAction(
  ref: { organizationId: string; agentId: string },
  _state: BudgetFormState,
  form: FormData,
): Promise<BudgetFormState> {
  const { organizationId, agentId } = ref;
  const session = await requireOrganization(organizationId, `/orgs/${organizationId}/agents/${agentId}`);
  const limit = String(form.get("limit") ?? "");
  const parsed = parseLimit(limit);
  if ("error" in parsed) {
    return { error: parsed.error, limit };
  }
  try {
    await setAgentBudget(session.accessToken, organizationId, agentId, parsed.limitUsd);
  } catch (error) {
    return {
      error: messageOf(error, {
        FORBIDDEN: "Only the organization's owners and admins set an agent's budget.",
        ORGANIZATION_SUSPENDED: "The organization is suspended.",
      }),
      limit,
    };
  }
  refresh();
  return { notice: parsed.limitUsd === null ? "The limit is removed." : "Saved." };
}
