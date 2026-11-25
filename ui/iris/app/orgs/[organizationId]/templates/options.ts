import "server-only";

import type { KnowledgeOption } from "@/app/components/knowledge-picker";
import { listAgents } from "@/lib/api/agora";
import { listOrganizationTaskTemplates } from "@/lib/api/hephaestus";
import { orUnavailable } from "@/lib/api/http";
import { listKnowledgeItems } from "@/lib/api/seshat";

/**
 * What a template's form offers: the organization's active agents; for a
 * project's template also the organization's active templates to extend
 * and the project's accepted knowledge (none when Seshat doesn't answer).
 */
export async function templateFormOptions(
  token: string,
  organizationId: string,
  projectId: string | null,
): Promise<{
  agents: { id: string; name: string }[];
  organizationTemplates?: { id: string; name: string; latestVersion: number }[];
  knowledge: KnowledgeOption[];
}> {
  const [agents, templates, knowledge] = await Promise.all([
    listAgents(token, organizationId),
    projectId ? listOrganizationTaskTemplates(token, organizationId) : null,
    projectId
      ? orUnavailable(
          listKnowledgeItems(token, organizationId, projectId, {
            status: "accepted",
          }),
        )
      : null,
  ]);
  return {
    agents: agents.items
      .filter((agent) => agent.status === "active")
      .map(({ id, name }) => ({ id, name })),
    ...(templates
      ? {
          organizationTemplates: templates.items
            .filter((template) => template.status === "active")
            .map(({ id, name, latestVersion }) => ({
              id,
              name,
              latestVersion,
            })),
        }
      : {}),
    knowledge: (knowledge?.items ?? []).map(({ id, title, type }) => ({
      id,
      title,
      type,
    })),
  };
}
