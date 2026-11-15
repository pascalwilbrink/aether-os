import { DomainError } from '@pistis/core';

export class ServiceAccountDisabledError extends DomainError {
  constructor(serviceAccountId: string) {
    super(
      `Service account ${serviceAccountId} is disabled.`,
      'SERVICE_ACCOUNT_DISABLED',
    );
  }
}
