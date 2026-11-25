import { DomainError } from '@polis/core';

export class TeamSlugTakenError extends DomainError {
  constructor(slug: string) {
    super(
      `Slug "${slug}" is already in use by a team of this organization.`,
      'TEAM_SLUG_TAKEN',
    );
  }
}

export class TeamArchivedError extends DomainError {
  constructor(teamId: string) {
    super(`Team ${teamId} is archived.`, 'TEAM_ARCHIVED');
  }
}

export class TeamMemberExistsError extends DomainError {
  constructor(personId: string) {
    super(`Person ${personId} is already in this team.`, 'TEAM_MEMBER_EXISTS');
  }
}
