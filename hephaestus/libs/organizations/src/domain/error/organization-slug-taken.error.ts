import { DomainError } from '@hephaestus/core';

export class OrganizationSlugTakenError extends DomainError {
  constructor(public readonly slug: string) {
    super(`Slug "${slug}" is already in use`, 'ORGANIZATION_SLUG_TAKEN');
  }
}
