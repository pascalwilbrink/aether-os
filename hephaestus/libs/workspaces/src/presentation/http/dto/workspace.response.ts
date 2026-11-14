import type {
  RepositoryConfiguration,
  SandboxConfiguration,
  SandboxReference,
  Workspace,
  WorkspaceStatus,
} from '../../../domain/workspace.js';

import type { ApiSchema } from '@hephaestus/core';

export class WorkspaceResponse implements ApiSchema<'WorkspaceResponse'> {
  id: string;
  organizationId: string;
  projectId: string;
  executionId: string;
  status: WorkspaceStatus;
  repository: RepositoryConfiguration;
  sandbox: SandboxConfiguration;
  sandboxReference: SandboxReference | null;
  workingDirectory: string;
  failureReason: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  destroyedAt: string | null;

  static fromDomain(workspace: Workspace): WorkspaceResponse {
    return Object.assign(new WorkspaceResponse(), {
      id: workspace.id,
      organizationId: workspace.organizationId,
      projectId: workspace.projectId,
      executionId: workspace.executionId,
      status: workspace.status,
      repository: workspace.repository,
      sandbox: workspace.sandbox,
      sandboxReference: workspace.sandboxReference,
      workingDirectory: workspace.workingDirectory,
      failureReason: workspace.failureReason,
      expiresAt: workspace.expiresAt.toISOString(),
      createdAt: workspace.createdAt.toISOString(),
      updatedAt: workspace.updatedAt.toISOString(),
      startedAt: workspace.startedAt?.toISOString() ?? null,
      destroyedAt: workspace.destroyedAt?.toISOString() ?? null,
    } satisfies WorkspaceResponse);
  }
}
