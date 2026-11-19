import type { ApiSchema, Skill } from "./api";

export type SkillFile = ApiSchema<"SkillFile">;
export type AgentSkill = ApiSchema<"AgentSkillConfiguration">;

/** The version form's fields: `skill:<name>` checked, `skillVersion:<name>` its pinned version. */
export const SKILL_FIELD = "skill:";
export const SKILL_VERSION_FIELD = "skillVersion:";

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A starting SKILL.md for a new skill. */
export const skillTemplate = (name: string) =>
  `---\nname: ${name || "my-skill"}\ndescription: What this skill does, and when to use it.\n---\n\n# ${name || "My skill"}\n\nStep-by-step instructions for the agent.\n`;

/**
 * A skill's request from its form: its name and SKILL.md (other files come
 * along unchanged from the version it started from), or what's wrong.
 */
export function skillFilesFromForm(
  fields: Record<string, string | undefined>,
  keep: SkillFile[] = [],
): { name: string; files: SkillFile[] } | { error: string } {
  const name = (fields.name ?? "").trim();
  const skillMd = fields.skillMd ?? "";
  if (!NAME.test(name) || name.length > 64) {
    return { error: "A skill's name is lowercase letters, digits and hyphens (at most 64), e.g. code-review." };
  }
  if (!skillMd.trim()) {
    return { error: "Write the skill's SKILL.md." };
  }
  return {
    name,
    files: [{ path: "SKILL.md", content: skillMd }, ...keep.filter((file) => file.path !== "SKILL.md")],
  };
}

/** The form's fields for a version's skills. */
export function skillFieldsOf(skills: AgentSkill[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const skill of skills) {
    if (!skill.enabled) continue;
    fields[`${SKILL_FIELD}${skill.name}`] = "on";
    fields[`${SKILL_VERSION_FIELD}${skill.name}`] = skill.version;
  }
  return fields;
}

/** A version's skills from the form: each checked one at the version chosen for it. */
export function skillsFromForm(fields: Record<string, string | undefined>): { skills: AgentSkill[] } | { error: string } {
  const skills: AgentSkill[] = [];
  for (const [key, checked] of Object.entries(fields)) {
    if (!key.startsWith(SKILL_FIELD) || checked !== "on") continue;
    const name = key.slice(SKILL_FIELD.length);
    const version = (fields[`${SKILL_VERSION_FIELD}${name}`] ?? "").trim();
    if (!/^[1-9]\d*$/.test(version)) return { error: `Choose a version of ${name}.` };
    skills.push({ name, version, enabled: true });
  }
  return { skills: skills.sort((a, b) => a.name.localeCompare(b.name)) };
}

/** Versions to offer for a skill, newest first. */
export const versionChoices = (skill: Pick<Skill, "latestVersion">) =>
  Array.from({ length: skill.latestVersion }, (_, i) => String(skill.latestVersion - i));

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
