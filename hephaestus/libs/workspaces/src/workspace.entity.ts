import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@hephaestus/core';

import type { WorkspaceStatus } from './workspace-transitions.js';

@Entity({ name: 'workspaces' })
@Check(
  'ck_workspaces_status',
  `status IN ('requested', 'provisioning', 'ready', 'in_use', 'suspended', 'stopping', 'destroyed', 'failed', 'expired')`,
)
// Keyset pagination within an organization: newest first, tie-broken by ID.
@Index('ix_workspaces_organization_id_created_at_id', [
  'organizationId',
  'createdAt',
  'id',
])
@Index('ix_workspaces_execution_id', ['executionId'])
export class WorkspaceEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid' })
  executionId: string;

  @Column({ type: 'text' })
  status: WorkspaceStatus;

  @Column({ type: 'jsonb' })
  repository: ApiTypes.RepositoryConfiguration;

  @Column({ type: 'jsonb' })
  sandbox: ApiTypes.SandboxConfiguration;

  /** Set by the provisioner when the sandbox is ready; cleared when destroyed. */
  @Column({ type: 'jsonb', nullable: true })
  sandboxReference: ApiTypes.SandboxReference | null;

  @Column({ type: 'text' })
  workingDirectory: string;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  destroyedAt: Date | null;
}
