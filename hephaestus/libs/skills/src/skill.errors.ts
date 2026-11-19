import { DomainError } from '@hephaestus/core';

export class SkillAlreadyExistsError extends DomainError {
  constructor(name: string) {
    super(
      `The organization already has a skill named ${name}.`,
      'SKILL_ALREADY_EXISTS',
    );
  }
}

export class SkillArchivedError extends DomainError {
  constructor(name: string) {
    super(`Skill ${name} is archived.`, 'SKILL_ARCHIVED');
  }
}

/** A folder that isn't a skill, or an agent version naming none. */
export class SkillInvalidError extends DomainError {
  constructor(reason: string) {
    super(reason, 'SKILL_INVALID');
  }
}

/** A skill version a run needs is gone (can't be: versions are kept). */
export class SkillUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkillUnavailableError';
  }
}
