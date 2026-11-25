"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionState } from "@/app/components/action-forms";
import {
  archiveSkill,
  createSkill,
  createSkillVersion,
  getSkill,
  getSkillVersion,
} from "@/lib/api/agora";
import { messageOf } from "@/lib/api/messages";
import { requireOrganization } from "@/lib/auth/current";
import { valuesOf } from "@/lib/forms";
import { skillFilesFromForm } from "@/lib/skills";

/** What the skill forms show after a submit. */
export interface SkillFormState {
  error?: string;
  notice?: string;
  values?: Record<string, string>;
}

export interface SkillRef {
  organizationId: string;
  skillId: string;
}

const listPath = (organizationId: string) => `/orgs/${organizationId}/skills`;
const skillPath = ({ organizationId, skillId }: SkillRef) =>
  `${listPath(organizationId)}/${skillId}`;

const skillMessageOf = (error: unknown) =>
  messageOf(error, {
    FORBIDDEN:
      "You aren't allowed to change this organization's skills (agent:write).",
    ORGANIZATION_SUSPENDED: "The organization is suspended.",
    SKILL_ARCHIVED: "This skill is archived: it gets no new versions.",
  });

/** Creates a skill from its SKILL.md and any uploaded files (`agent:write`), then opens it. */
export async function createSkillAction(
  organizationId: string,
  _state: SkillFormState,
  form: FormData,
): Promise<SkillFormState> {
  const session = await requireOrganization(
    organizationId,
    listPath(organizationId),
  );
  const fields = valuesOf(form);
  const result = skillFilesFromForm(fields);
  if ("error" in result) return { error: result.error, values: fields };
  let skillId: string;
  try {
    skillId = (await createSkill(session.accessToken, organizationId, result))
      .id;
  } catch (error) {
    return { error: skillMessageOf(error), values: fields };
  }
  redirect(skillPath({ organizationId, skillId }));
}

/**
 * A new version with this SKILL.md, and an uploaded folder's other files, or
 * else the latest version's, unchanged.
 */
export async function createSkillVersionAction(
  ref: SkillRef,
  _state: SkillFormState,
  form: FormData,
): Promise<SkillFormState> {
  const session = await requireOrganization(ref.organizationId, skillPath(ref));
  const fields = valuesOf(form);
  try {
    const skill = await getSkill(
      session.accessToken,
      ref.organizationId,
      ref.skillId,
    );
    const latest = await getSkillVersion(
      session.accessToken,
      ref.organizationId,
      ref.skillId,
      skill.latestVersion,
    );
    const result = skillFilesFromForm(
      { ...fields, name: skill.name },
      latest.files ?? [],
    );
    if ("error" in result) return { error: result.error, values: fields };
    const created = await createSkillVersion(
      session.accessToken,
      ref.organizationId,
      ref.skillId,
      {
        files: result.files,
      },
    );
    refresh();
    return {
      notice: `Version ${created.version} saved. Agent versions choose it in their next version.`,
    };
  } catch (error) {
    return { error: skillMessageOf(error), values: fields };
  }
}

export async function archiveSkillAction(ref: SkillRef): Promise<ActionState> {
  const session = await requireOrganization(ref.organizationId, skillPath(ref));
  try {
    await archiveSkill(session.accessToken, ref.organizationId, ref.skillId);
  } catch (error) {
    return { error: skillMessageOf(error) };
  }
  refresh();
  return {};
}
