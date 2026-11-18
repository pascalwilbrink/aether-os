import { Inject, Injectable, Logger } from '@nestjs/common';

import { TasksService } from '@hephaestus/tasks';

import { ExecutionsService } from './executions.service.js';
import { RUNNER_OPTIONS, type RunnerOptions } from './runner.options.js';
import { SandboxProvisioner } from './sandbox-provisioner.js';

/**
 * Ends executions whose runner went quiet or overran (docs/tasks.md,
 * Timeouts), whichever Hephaestus instance ran them: a missed heartbeat or
 * provisioning timeout is an infrastructure failure (retried), a run past
 * its deadline fails with `timeout`, and a cancelled task's execution is
 * cancelled. Their sandboxes are destroyed.
 */
@Injectable()
export class ExecutionReaper {
  private readonly logger = new Logger(ExecutionReaper.name);

  constructor(
    private readonly executions: ExecutionsService,
    private readonly tasks: TasksService,
    private readonly provisioner: SandboxProvisioner,
    @Inject(RUNNER_OPTIONS) private readonly options: RunnerOptions,
  ) {}

  async reap(now = new Date()): Promise<number> {
    const stale = await this.executions.stale(now);
    for (const execution of stale) {
      const status = await this.tasks.statusOf(
        execution.organizationId,
        execution.taskId,
      );
      if (status === 'cancelled') {
        await this.executions.cancelled(execution.id);
      } else if (execution.expired === 'run') {
        await this.executions.fail(
          execution.id,
          'timeout',
          `The run took longer than ${seconds(this.options.runTimeoutMs)}`,
        );
      } else {
        await this.executions.fail(
          execution.id,
          'infrastructure',
          execution.expired === 'heartbeat'
            ? `No heartbeat from its runner for ${seconds(this.options.heartbeatTimeoutMs)}`
            : `Provisioning took longer than ${seconds(this.options.provisioningTimeoutMs)}`,
        );
      }
      try {
        await this.provisioner.destroy({
          organizationId: execution.organizationId,
          executionId: execution.id,
          reference: execution.sandboxReference,
        });
        await this.executions.sandboxDestroyed(execution.id);
      } catch (error) {
        this.logger.warn(
          `Destroying the sandbox of execution ${execution.id} failed: ${String(error)}`,
        );
      }
    }
    return stale.length;
  }
}

export function seconds(ms: number): string {
  return `${Math.round(ms / 1000)} seconds`;
}
