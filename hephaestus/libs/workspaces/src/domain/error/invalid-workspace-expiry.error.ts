import { DomainError } from '@hephaestus/core';

export class InvalidWorkspaceExpiryError extends DomainError {
  constructor(public readonly expiresAt: Date) {
    super(
      `Workspace expiry must be in the future (got ${expiresAt.toISOString()})`,
      'WORKSPACE_INVALID_EXPIRY',
    );
  }
}
