import { DomainError, type OrganizationId } from '@hephaestus/core';

export class OrganizationSuspendedError extends DomainError {
  constructor(public readonly organizationId: OrganizationId) {
    super(
      `Organization ${organizationId} is suspended`,
      'ORGANIZATION_SUSPENDED',
    );
  }
}
