import { DomainError } from '@polis/core';

export class OrganizationSlugTakenError extends DomainError {
  constructor(slug: string) {
    super(`Slug "${slug}" is already in use.`, 'ORGANIZATION_SLUG_TAKEN');
  }
}

export class OrganizationSuspendedError extends DomainError {
  constructor(organizationId: string) {
    super(
      `Organization ${organizationId} is suspended and can't be changed.`,
      'ORGANIZATION_SUSPENDED',
    );
  }
}
