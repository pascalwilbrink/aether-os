import type {
  ExecutionId,
  OrganizationId,
  ProjectId,
  WorkspaceId,
} from '@hephaestus/core';

import { InvalidWorkspaceExpiryError } from './error/invalid-workspace-expiry.error.js';
import { InvalidWorkspaceTransitionError } from './error/invalid-workspace-transition.error.js';

export type WorkspaceStatus =
  | 'requested'
  | 'provisioning'
  | 'ready'
  | 'in_use'
  | 'suspended'
  | 'stopping'
  | 'destroyed'
  | 'failed'
  | 'expired';

export interface RepositoryConfiguration {
  provider: 'github' | 'gitlab' | 'bitbucket';
  repositoryUrl: string;
  branch: string;
  commitSha?: string;
}

export interface SandboxConfiguration {
  provider: string;
  image: string;
  cpuLimit: number;
  memoryLimitMb: number;
  networkAccess: 'none' | 'restricted' | 'full';
}

export interface SandboxReference {
  provider: string;
  resourceId: string;
}

export interface CreateWorkspaceProps {
  id: WorkspaceId;
  organizationId: OrganizationId;
  projectId: ProjectId;
  executionId: ExecutionId;

  repository: RepositoryConfiguration;
  sandbox: SandboxConfiguration;

  workingDirectory: string;
  expiresAt: Date;
}

export interface WorkspaceProps extends CreateWorkspaceProps {
  status: WorkspaceStatus;
  sandboxReference: SandboxReference | null;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  destroyedAt: Date | null;
}

const DESTROYABLE: readonly WorkspaceStatus[] = [
  'ready',
  'in_use',
  'suspended',
  'failed',
  'expired',
];

const TERMINAL_OR_STOPPING: readonly WorkspaceStatus[] = [
  'destroyed',
  'stopping',
  'expired',
];

export class Workspace {
  private constructor(
    private readonly props: WorkspaceProps,
  ) {}

  static create(props: CreateWorkspaceProps): Workspace {
    const now = new Date();

    if (props.expiresAt <= now) {
      throw new InvalidWorkspaceExpiryError(props.expiresAt);
    }

    return new Workspace({
      ...props,
      status: 'requested',
      sandboxReference: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      destroyedAt: null,
    });
  }

  static reconstitute(props: WorkspaceProps): Workspace {
    return new Workspace({
      ...props,
      expiresAt: new Date(props.expiresAt),
      createdAt: new Date(props.createdAt),
      updatedAt: new Date(props.updatedAt),
      startedAt: props.startedAt
        ? new Date(props.startedAt)
        : null,
      destroyedAt: props.destroyedAt
        ? new Date(props.destroyedAt)
        : null,
    });
  }

  get id(): WorkspaceId {
    return this.props.id;
  }

  get organizationId(): OrganizationId {
    return this.props.organizationId;
  }

  get projectId(): ProjectId {
    return this.props.projectId;
  }

  get executionId(): ExecutionId {
    return this.props.executionId;
  }

  get status(): WorkspaceStatus {
    return this.props.status;
  }

  get repository(): RepositoryConfiguration {
    return { ...this.props.repository };
  }

  get sandbox(): SandboxConfiguration {
    return { ...this.props.sandbox };
  }

  get sandboxReference(): SandboxReference | null {
    return this.props.sandboxReference
      ? { ...this.props.sandboxReference }
      : null;
  }

  get workingDirectory(): string {
    return this.props.workingDirectory;
  }

  get expiresAt(): Date {
    return new Date(this.props.expiresAt);
  }

  get createdAt(): Date {
    return new Date(this.props.createdAt);
  }

  get updatedAt(): Date {
    return new Date(this.props.updatedAt);
  }

  get startedAt(): Date | null {
    return this.props.startedAt
      ? new Date(this.props.startedAt)
      : null;
  }

  get destroyedAt(): Date | null {
    return this.props.destroyedAt
      ? new Date(this.props.destroyedAt)
      : null;
  }

  get failureReason(): string | null {
    return this.props.failureReason;
  }

  startProvisioning(): void {
    this.ensureStatus('requested', 'provisioning');

    this.transitionTo('provisioning');
  }

  markReady(reference: SandboxReference): void {
    this.ensureStatus('provisioning', 'ready');

    this.props.sandboxReference = { ...reference };

    this.transitionTo('ready');
  }

  acquire(): void {
    this.ensureStatus('ready', 'in_use');

    this.props.startedAt = new Date();

    this.transitionTo('in_use');
  }

  release(): void {
    this.ensureStatus('in_use', 'ready');

    this.transitionTo('ready');
  }

  suspend(): void {
    this.ensureStatus('ready', 'suspended');

    this.transitionTo('suspended');
  }

  resume(): void {
    this.ensureStatus('suspended', 'ready');

    this.transitionTo('ready');
  }

  startDestroying(): void {
    if (!DESTROYABLE.includes(this.props.status)) {
      throw this.invalidTransition('stopping');
    }

    this.transitionTo('stopping');
  }

  markDestroyed(): void {
    this.ensureStatus('stopping', 'destroyed');

    this.props.sandboxReference = null;
    this.props.destroyedAt = new Date();

    this.transitionTo('destroyed');
  }

  markFailed(reason: string): void {
    if (TERMINAL_OR_STOPPING.includes(this.props.status)) {
      throw this.invalidTransition('failed');
    }

    this.props.failureReason = reason;

    this.transitionTo('failed');
  }

  expire(): void {
    if (TERMINAL_OR_STOPPING.includes(this.props.status)) {
      throw this.invalidTransition('expired');
    }

    this.transitionTo('expired');
  }

  private ensureStatus(
    expected: WorkspaceStatus,
    target: WorkspaceStatus,
  ): void {
    if (this.props.status !== expected) {
      throw this.invalidTransition(target);
    }
  }

  private invalidTransition(
    target: WorkspaceStatus,
  ): InvalidWorkspaceTransitionError {
    return new InvalidWorkspaceTransitionError(
      this.props.id,
      this.props.status,
      target,
    );
  }

  private transitionTo(status: WorkspaceStatus): void {
    this.props.status = status;
    this.props.updatedAt = new Date();
  }
}
