import { DomainError, type WorkspaceId } from '@hephaestus/core';

import type { WorkspaceStatus } from '../workspace.js';

export class InvalidWorkspaceTransitionError extends DomainError {
  constructor(
    public readonly workspaceId: WorkspaceId,
    public readonly from: WorkspaceStatus,
    public readonly to: WorkspaceStatus,
  ) {
    super(
      `Workspace ${workspaceId} cannot move from ${from} to ${to}`,
      'WORKSPACE_INVALID_TRANSITION',
    );
  }
}
