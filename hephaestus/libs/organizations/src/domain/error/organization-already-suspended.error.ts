import { DomainError, type OrganizationId } from '@hephaestus/core';

export class OrganizationAlreadySuspendedError extends DomainError {
  constructor(public readonly organizationId: OrganizationId) {
    super(
      `Organization ${organizationId} is already suspended`,
      'ORGANIZATION_ALREADY_SUSPENDED',
    );
  }
}
