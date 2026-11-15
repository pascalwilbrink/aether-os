import { DomainError } from '@polis/core';

export class ProjectSlugTakenError extends DomainError {
  constructor(slug: string) {
    super(
      `Slug "${slug}" is already in use in this organization.`,
      'PROJECT_SLUG_TAKEN',
    );
  }
}
