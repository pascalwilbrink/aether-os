import { Inject, Injectable, Logger } from '@nestjs/common';

import { WorkspacesService } from '@hephaestus/workspaces';

import { RunnerFailure } from './runner.errors.js';
import { SandboxDriver } from './sandbox-driver.js';
import {
  SandboxProvisioner,
  type Sandbox,
  type SandboxRelease,
  type SandboxRequest,
} from './sandbox-provisioner.js';

export const SANDBOX_OPTIONS = Symbol('SANDBOX_OPTIONS');

/** The platform's sandbox settings (`SANDBOX_*`). */
export interface SandboxOptions {
  image: string;
  user: string;
  cpus: number;
  memoryMb: number;
  pidsLimit: number;
  workspaceMb: number;
  /** How long a sandbox may live: provisioning plus run timeouts. */
  lifetimeMs: number;
}

const WORKING_DIRECTORY = '/workspace';

/**
 * Sandboxes as workspaces (Hephaestus stays the source of truth for
 * workspace state, ../CLAUDE.md): each execution whose agent version needs
 * a sandbox gets a workspace (`requested` → `provisioning` → `ready` →
 * `in_use`, then `stopping` → `destroyed`, or `failed`), backed by a
 * sandbox from the `SandboxDriver`. The workspace's `executionId` ties the
 * two, so a sandbox can always be found and destroyed, even when its
 * execution ended before the reference was stored.
 */
@Injectable()
export class WorkspaceSandboxProvisioner extends SandboxProvisioner {
  private readonly logger = new Logger(WorkspaceSandboxProvisioner.name);

  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly driver: SandboxDriver,
    @Inject(SANDBOX_OPTIONS) private readonly options: SandboxOptions,
  ) {
    super();
  }

  async provision({
    task,
    executionId,
    agentVersion,
    signal,
  }: SandboxRequest): Promise<Sandbox | null> {
    if (!agentVersion.runtime.sandboxRequired) {
      return null;
    }
    const { organizationId } = task;
    const workspace = await this.workspaces.createForExecution(organizationId, {
      projectId: task.projectId,
      executionId,
      sandbox: {
        provider: this.driver.provider,
        image: this.options.image,
        cpuLimit: this.options.cpus,
        memoryLimitMb: this.options.memoryMb,
        networkAccess: 'none',
      },
      workingDirectory: WORKING_DIRECTORY,
      expiresAt: new Date(Date.now() + this.options.lifetimeMs).toISOString(),
    });
    await this.workspaces.startProvisioning(organizationId, workspace.id);

    try {
      const created = await this.driver.create(
        {
          sandboxId: executionId,
          image: this.options.image,
          user: this.options.user,
          cpus: this.options.cpus,
          memoryMb: this.options.memoryMb,
          pidsLimit: this.options.pidsLimit,
          workspaceMb: this.options.workspaceMb,
          workingDirectory: WORKING_DIRECTORY,
          labels: {
            'aether-os.organization-id': organizationId,
            'aether-os.project-id': task.projectId,
            'aether-os.task-id': task.id,
            'aether-os.execution-id': executionId,
            'aether-os.workspace-id': workspace.id,
          },
        },
        signal,
      );
      await this.workspaces.markReady(organizationId, workspace.id, {
        provider: this.driver.provider,
        resourceId: created.resourceId,
      });
      await this.workspaces.acquireForExecution(organizationId, workspace.id);
      return {
        reference: {
          provider: this.driver.provider,
          workspaceId: workspace.id,
          resourceId: created.resourceId,
        },
        agentSandbox: created.agentSandbox,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.driver.remove(executionId).catch(() => undefined);
      await this.workspaces
        .markFailed(organizationId, workspace.id, message)
        .catch(() => undefined);
      throw new RunnerFailure(
        `The sandbox could not be created: ${message}`,
        'infrastructure',
      );
    }
  }

  async destroy({
    organizationId,
    executionId,
  }: SandboxRelease): Promise<void> {
    const workspaces = await this.workspaces.activeForExecution(
      organizationId,
      executionId,
    );
    if (workspaces.length === 0) {
      // Never got as far as a workspace (or already destroyed).
      return;
    }
    await this.driver.remove(executionId);
    for (const workspace of workspaces) {
      try {
        if (workspace.status !== 'stopping') {
          await this.workspaces.destroyForExecution(
            organizationId,
            workspace.id,
          );
        }
        await this.workspaces.markDestroyed(organizationId, workspace.id);
      } catch (error) {
        // Not destroyable from its state (requested, provisioning): failed.
        this.logger.debug(
          `Workspace ${workspace.id} ends as failed: ${String(error)}`,
        );
        await this.workspaces.markFailed(
          organizationId,
          workspace.id,
          'Its execution ended before it was ready',
        );
      }
    }
  }
}
