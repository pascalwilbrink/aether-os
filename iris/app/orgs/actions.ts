"use server";

import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api/http";
import { createOrganization } from "@/lib/api/polis";
import { requireSession } from "@/lib/auth/current";

export interface CreateOrganizationState {
  error?: string;
}

/**
 * Founds an organization (the signed-in person becomes its owner), then
 * signs into it. Checks the session itself: a Server Function is its own
 * endpoint (Next.js's data security guide).
 */
export async function createOrganizationAction(
  _state: CreateOrganizationState,
  form: FormData,
): Promise<CreateOrganizationState> {
  const session = await requireSession("/orgs");
  const name = String(form.get("name") ?? "").trim();
  const slug = String(form.get("slug") ?? "").trim();

  let organizationId: string;
  try {
    organizationId = (await createOrganization(session.accessToken, { name, slug })).id;
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        error:
          error.code === "ORGANIZATION_SLUG_TAKEN"
            ? "That slug is taken."
            : error.status === 400
              ? "Use a name, and a slug of lowercase letters, digits and single dashes."
              : error.message,
      };
    }
    throw error;
  }
  redirect(`/auth/sign-in?organization=${organizationId}`);
}
