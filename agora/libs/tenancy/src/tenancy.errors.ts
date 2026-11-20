import { ServiceUnavailableException } from '@nestjs/common';

import { DomainError } from '@agora/core';

export class OrganizationSuspendedError extends DomainError {
  constructor(organizationId: string) {
    super(
      `Organization ${organizationId} is suspended and can't be changed.`,
      'ORGANIZATION_SUSPENDED',
    );
  }
}

/** Polis couldn't be asked (503). */
export class PolisUnavailableError extends ServiceUnavailableException {
  constructor(reason: string) {
    super(`Polis can't be reached right now (${reason}). Try again.`);
  }
}
