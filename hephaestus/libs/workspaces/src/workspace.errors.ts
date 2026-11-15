import { DomainError } from '@hephaestus/core';

import type {
  WorkspaceAction,
  WorkspaceStatus,
} from './workspace-transitions.js';

export class InvalidWorkspaceTransitionError extends DomainError {
  constructor(
    workspaceId: string,
    from: WorkspaceStatus,
    action: WorkspaceAction,
  ) {
    super(
      `Workspace ${workspaceId} can't ${action} while ${from}.`,
      'WORKSPACE_INVALID_TRANSITION',
    );
  }
}

export class InvalidWorkspaceExpiryError extends DomainError {
  constructor(expiresAt: string) {
    super(
      `The expiry ${expiresAt} must be in the future.`,
      'WORKSPACE_INVALID_EXPIRY',
    );
  }
}
