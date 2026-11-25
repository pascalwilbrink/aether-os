"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api/http";
import { messageOf } from "@/lib/api/messages";
import { connectGitHub, syncInstallation } from "@/lib/api/proxenos";
import { requireOrganization } from "@/lib/auth/current";

export interface ActionState {
  error?: string;
}

const githubPath = (organizationId: string) => `/orgs/${organizationId}/github`;

/** Proxenos's refusals, and Proxenos (or GitHub behind it) not answering. */
function githubMessageOf(error: unknown, forbidden: string): string {
  if (!(error instanceof ApiError) || error.status >= 500) {
    return "GitHub can't be reached from Aether-os right now, or no GitHub App is set up for it yet. Try again later.";
  }
  return messageOf(error, {
    FORBIDDEN: forbidden,
    ORGANIZATION_SUSPENDED: "The organization is suspended.",
  });
}

/**
 * Starts connecting the GitHub App (`org:manage`), then sends the person to
 * GitHub's installation page. GitHub and Proxenos bring them back to this
 * organization's GitHub page with `?github=connected` or `failed`.
 */
export async function connectGitHubAction(
  organizationId: string,
): Promise<ActionState> {
  const session = await requireOrganization(
    organizationId,
    githubPath(organizationId),
  );
  let installUrl: string;
  try {
    ({ installUrl } = await connectGitHub(
      session.accessToken,
      organizationId,
      githubPath(organizationId),
    ));
  } catch (error) {
    return {
      error: githubMessageOf(
        error,
        "Only the organization's owners and admins connect GitHub.",
      ),
    };
  }
  redirect(installUrl);
}

/** Reads an installation from GitHub again (`org:manage`): repositories added or removed since. */
export async function syncInstallationAction(ref: {
  organizationId: string;
  installationId: string;
}): Promise<ActionState> {
  const session = await requireOrganization(
    ref.organizationId,
    githubPath(ref.organizationId),
  );
  try {
    await syncInstallation(
      session.accessToken,
      ref.organizationId,
      ref.installationId,
    );
  } catch (error) {
    return {
      error: githubMessageOf(
        error,
        "Only the organization's owners and admins sync GitHub.",
      ),
    };
  }
  refresh();
  return {};
}
