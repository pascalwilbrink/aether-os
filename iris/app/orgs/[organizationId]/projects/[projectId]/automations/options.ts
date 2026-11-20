import "server-only";

import { listAgents, listTaskTemplates } from "@/lib/api/hephaestus";
import { ApiError } from "@/lib/api/http";
import { listServiceAccounts } from "@/lib/api/pistis";
import { listProjectMemberships } from "@/lib/api/polis";
import { listRepositoryLinks, orUnavailable } from "@/lib/api/proxenos";
import { repositoryChoices } from "@/lib/github";
import { runnableServiceAccounts } from "@/lib/members";

import type { AutomationOptions } from "./automation-form";

/**
 * What an automation's form offers: agents with a published version,
 * service accounts with a role in the project, the project's active
 * templates and repository links (none when Proxenos can't answer).
 */
export async function automationOptions(
  token: string,
  organizationId: string,
  projectId: string,
): Promise<AutomationOptions & { repositoriesUnavailable: boolean }> {
  const [agents, templates, serviceAccounts, grants, links] = await Promise.all(
    [
      listAgents(token, organizationId),
      listTaskTemplates(token, organizationId, projectId),
      listServiceAccounts(token, organizationId).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 403)
          return { items: [], nextCursor: null };
        throw error;
      }),
      listProjectMemberships(token, organizationId, projectId),
      orUnavailable(listRepositoryLinks(token, organizationId, projectId)),
    ],
  );
  return {
    agents: agents.items
      .filter((agent) => agent.status === "active" && agent.latestVersionId)
      .map(({ id, name }) => ({ id, name })),
    serviceAccounts: runnableServiceAccounts(
      serviceAccounts.items,
      grants.items,
    ).map(({ id, name }) => ({ id, name })),
    templates: templates.items
      .filter((template) => template.status === "active")
      .map(({ id, name }) => ({ id, name })),
    repositories: repositoryChoices(links.items),
    repositoriesUnavailable: links.unavailable,
  };
}
