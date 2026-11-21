import type { ApiTypes } from '@agora/core';

/** A skill version's files in all: at most 1 MiB. */
export const MAX_SKILL_BYTES = 1024 * 1024;

export interface CheckedSkill {
  name: string;
  description: string;
  sizeBytes: number;
}

/**
 * Checks a skill's folder (the Agent Skills format), returning what its
 * `SKILL.md` says, or why it isn't one: `SKILL.md` at the root, with front
 * matter naming the skill (`name`, as `expectedName` when given) and saying
 * what it's for (`description`, one line, at most 1024 characters); paths
 * unique, none with `.` or `..` segments; 1 MiB in all.
 */
export function checkSkillFiles(
  files: readonly ApiTypes.SkillFile[],
  expectedName?: string,
): CheckedSkill | { problem: string } {
  const paths = new Set<string>();
  let sizeBytes = 0;
  for (const file of files) {
    if (file.path.split('/').some((part) => part === '.' || part === '..')) {
      return { problem: `${file.path} isn't a path inside the skill.` };
    }
    if (paths.has(file.path)) {
      return { problem: `${file.path} is there twice.` };
    }
    paths.add(file.path);
    sizeBytes += Buffer.byteLength(file.content, 'utf8');
  }
  if (sizeBytes > MAX_SKILL_BYTES) {
    return { problem: 'A skill is at most 1 MiB in all.' };
  }
  const skillMd = files.find((file) => file.path === 'SKILL.md');
  if (!skillMd) {
    return { problem: 'A skill has a SKILL.md at its root.' };
  }
  const front = frontMatterOf(skillMd.content);
  if (!front) {
    return {
      problem:
        'SKILL.md starts with front matter: "---", then name: and description:, then "---".',
    };
  }
  const name = front.name ?? '';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    return {
      problem:
        "SKILL.md's name is lowercase letters, digits and hyphens (at most 64).",
    };
  }
  if (expectedName !== undefined && name !== expectedName) {
    return {
      problem: `SKILL.md names the skill ${name}, but it is ${expectedName}.`,
    };
  }
  const description = front.description ?? '';
  if (!description || description.length > 1024) {
    return {
      problem:
        "SKILL.md's description says what the skill is for and when to use it, in at most 1024 characters.",
    };
  }
  return { name, description, sizeBytes };
}

/**
 * The simple `key: value` lines of a YAML front matter block; null when
 * there's none. Quoted values lose their quotes; nested or multi-line
 * values are left out (only `name` and `description` matter here).
 */
export function frontMatterOf(text: string): Record<string, string> | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?(\n|$)/.exec(text);
  if (!match) {
    return null;
  }
  const values: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*?)\s*$/.exec(line);
    if (!pair) continue;
    let value = pair[2];
    if (/^(["']).*\1$/.test(value)) {
      value = value.slice(1, -1);
    }
    if (value === '|' || value === '>') continue;
    values[pair[1]] = value;
  }
  return values;
}
