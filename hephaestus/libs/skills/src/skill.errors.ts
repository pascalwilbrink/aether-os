/** A skill version a run needs isn't in the copy (it can't be: versions are kept). */
export class SkillUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillUnavailableError';
  }
}

/**
 * An event about a skill the copy doesn't have yet: the consumer retries it
 * once `skill.created` is in.
 */
export class SkillNotCopiedYetError extends Error {
  constructor(skillId: string) {
    super(`Skill ${skillId} isn't in Hephaestus's copy yet`);
    this.name = 'SkillNotCopiedYetError';
  }
}
