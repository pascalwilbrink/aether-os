"use server";

import { messageOf } from "@/lib/api/messages";
import { createKnowledgeItem } from "@/lib/api/seshat";
import { requireOrganization } from "@/lib/auth/current";
import { knowledgeDraftOf } from "@/lib/copilot";

import type { ProjectRef } from "../actions";

/**
 * The copilot's Server Functions (docs/interaction.md, "Built: the
 * copilot"): saving what it drafted, with the person's own token.
 */

const projectPath = ({ organizationId, projectId }: ProjectRef) =>
  `/orgs/${organizationId}/projects/${projectId}`;

/** Saves a knowledge item the copilot drafted, once the person clicked Save. */
export async function saveCopilotKnowledgeAction(
  ref: ProjectRef,
  draft: unknown,
): Promise<{ id: string; href: string } | { error: string }> {
  const session = await requireOrganization(ref.organizationId, projectPath(ref));
  const parsed = knowledgeDraftOf(draft);
  if ("error" in parsed) return parsed;
  try {
    const { id } = await createKnowledgeItem(
      session.accessToken,
      ref.organizationId,
      ref.projectId,
      parsed.request,
    );
    return { id, href: `${projectPath(ref)}/knowledge/${id}` };
  } catch (error) {
    return {
      error: messageOf(error, {
        FORBIDDEN:
          "Your role in this project doesn't allow writing knowledge: that needs editor or above.",
        PROJECT_ARCHIVED: "The project is archived.",
        ORGANIZATION_SUSPENDED: "The organization is suspended.",
      }),
    };
  }
}
