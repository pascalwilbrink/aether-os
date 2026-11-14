import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type {
  RepositoryConfiguration,
  SandboxConfiguration,
  SandboxReference,
  WorkspaceStatus,
} from '../../../domain/workspace.js';

@Entity({ name: 'workspaces' })
@Index('IDX_workspaces_organization_id', ['organizationId'])
@Index('IDX_workspaces_execution_id', ['executionId'])
export class WorkspaceEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  projectId: string;

  @Column({ type: 'varchar' })
  executionId: string;

  @Column({ type: 'simple-json' })
  repository: RepositoryConfiguration;

  @Column({ type: 'simple-json' })
  sandbox: SandboxConfiguration;

  @Column({ type: 'varchar' })
  workingDirectory: string;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @Column({ type: 'varchar' })
  status: WorkspaceStatus;

  @Column({ type: 'simple-json', nullable: true })
  sandboxReference: SandboxReference | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'datetime' })
  createdAt: Date;

  @Column({ type: 'datetime' })
  updatedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  destroyedAt: Date | null;
}
