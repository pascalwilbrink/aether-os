import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { AgentVersionsService } from '@hephaestus/agents';
import type { TaskResponse } from '@hephaestus/tasks';

import { AgentRuntime } from './agent-runtime.js';
import { ExecutionReaper, seconds } from './execution-reaper.js';
import { ExecutionsService } from './executions.service.js';
import { RunnerFailure } from './runner.errors.js';
import { RUNNER_OPTIONS, type RunnerOptions } from './runner.options.js';
import { SandboxProvisioner, type Sandbox } from './sandbox-provisioner.js';
import { TaskTokens } from './task-tokens.js';

/** Why the runner stops an execution before it ends by itself. */
type StopReason =
  'cancelled' | 'timeout' | 'provisioning-timeout' | 'lost' | 'interrupted';

class Stopped extends Error {
  constructor(readonly reason: StopReason) {
    super(`Stopped: ${reason}`);
  }
}

interface Running {
  taskId: string;
  controller: AbortController;
  done: Promise<void>;
}

/** Pistis issues task tokens for at most an hour. */
const MAX_TOKEN_SECONDS = 3600;

/**
 * Runs queued tasks (docs/tasks.md, Task lifecycle), in every Hephaestus
 * instance at once. Each poll it ends stale executions (`ExecutionReaper`),
 * then claims tasks while it has room (`RUNNER_MAX_EXECUTIONS`) and runs
 * each in its own execution:
 *
 * 1. a task token for the task's service account (Pistis), the pinned agent
 *    version, and a sandbox if the version needs one (`provisioning`);
 * 2. the agent runtime, until it finishes, fails, or is stopped (`running`);
 * 3. the result: success, `agent_failed`, or an infrastructure failure
 *    retried with backoff (`ExecutionsService`); the sandbox is destroyed.
 *
 * While executions run, a heartbeat keeps them alive and notices cancelled
 * tasks; timeouts and cancellation abort the runtime's signal and give it
 * `RUNNER_STOP_GRACE_MS` before abandoning it. On shutdown, running
 * executions are interrupted and their tasks requeued.
 */
@Injectable()
export class TaskRunner
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  /** This instance, as recorded on its executions. */
  readonly id = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

  private readonly logger = new Logger(TaskRunner.name);
  private readonly running = new Map<string, Running>();
  private polling: NodeJS.Timeout | undefined;
  private beating: NodeJS.Timeout | undefined;
  private ticking: Promise<void> | undefined;
  private stopping = false;

  constructor(
    @Inject(RUNNER_OPTIONS) private readonly options: RunnerOptions,
    private readonly executions: ExecutionsService,
    private readonly reaper: ExecutionReaper,
    private readonly agentVersions: AgentVersionsService,
    private readonly runtime: AgentRuntime,
    private readonly provisioner: SandboxProvisioner,
    private readonly tokens: TaskTokens,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.options.enabled) {
      return;
    }
    this.polling = setInterval(() => {
      this.tick().catch((error: unknown) =>
        this.logger.error(`Runner poll failed: ${String(error)}`),
      );
    }, this.options.pollIntervalMs);
    this.beating = setInterval(() => {
      this.heartbeat().catch((error: unknown) =>
        this.logger.error(`Heartbeat failed: ${String(error)}`),
      );
    }, this.options.heartbeatIntervalMs);
    this.logger.log(`Runner ${this.id} started`);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    clearInterval(this.polling);
    clearInterval(this.beating);
    await this.ticking;
    for (const execution of this.running.values()) {
      execution.controller.abort(new Stopped('interrupted'));
    }
    await this.drain();
  }

  /**
   * One round: end stale executions, then start what fits. Overlapping
   * calls share the round in progress.
   */
  tick(): Promise<void> {
    this.ticking ??= this.round().finally(() => {
      this.ticking = undefined;
    });
    return this.ticking;
  }

  /** Keeps this instance's executions alive; stops cancelled or lost ones. */
  async heartbeat(): Promise<void> {
    for (const [executionId, execution] of this.running) {
      const { active, taskStatus } =
        await this.executions.heartbeat(executionId);
      if (!active) {
        execution.controller.abort(new Stopped('lost'));
      } else if (taskStatus === 'cancelled') {
        execution.controller.abort(new Stopped('cancelled'));
      }
    }
  }

  /** Waits for every execution this instance is running to end. */
  async drain(): Promise<void> {
    await Promise.allSettled(
      [...this.running.values()].map((execution) => execution.done),
    );
  }

  /** The executions this instance is running (tests, diagnostics). */
  get activeExecutions(): number {
    return this.running.size;
  }

  private async round(): Promise<void> {
    await this.reaper.reap();
    while (!this.stopping && this.running.size < this.options.maxExecutions) {
      const claimed = await this.executions.claim(this.id);
      if (!claimed) {
        return;
      }
      this.launch(claimed.task, claimed.executionId);
    }
  }

  private launch(task: TaskResponse, executionId: string): void {
    const controller = new AbortController();
    const done = this.execute(task, executionId, controller)
      .catch((error: unknown) =>
        this.logger.error(
          `Execution ${executionId} of task ${task.id} could not be recorded: ${String(error)}`,
        ),
      )
      .finally(() => this.running.delete(executionId));
    this.running.set(executionId, { taskId: task.id, controller, done });
  }

  private async execute(
    task: TaskResponse,
    executionId: string,
    controller: AbortController,
  ): Promise<void> {
    const { signal } = controller;
    const stopAfter = (ms: number, reason: StopReason) => {
      const timer = setTimeout(() => controller.abort(new Stopped(reason)), ms);
      timer.unref();
      return timer;
    };
    const timers = [
      stopAfter(this.options.provisioningTimeoutMs, 'provisioning-timeout'),
    ];
    let sandbox: Sandbox | null = null;

    try {
      const agentVersion = await this.untilStopped(
        this.agentVersions.findById(
          task.organizationId,
          task.agentId,
          task.agentVersionId,
        ),
        signal,
      );
      const token = await this.untilStopped(
        this.tokens.issue({
          serviceAccountId: task.serviceAccountId,
          organizationId: task.organizationId,
          projectId: task.projectId,
          taskId: task.id,
          expiresInSeconds: Math.min(
            MAX_TOKEN_SECONDS,
            Math.ceil(
              (this.options.provisioningTimeoutMs + this.options.runTimeoutMs) /
                1000,
            ),
          ),
        }),
        signal,
      );
      sandbox = await this.untilStopped(
        this.provisioner.provision({ task, executionId, agentVersion, signal }),
        signal,
      );
      clearTimeout(timers[0]);

      const deadline = await this.executions.markRunning(
        executionId,
        sandbox?.reference ?? null,
      );
      if (!deadline) {
        return;
      }
      timers.push(stopAfter(deadline.getTime() - Date.now(), 'timeout'));

      const source = {
        organizationId: task.organizationId,
        projectId: task.projectId,
        taskId: task.id,
        executionId,
        agentVersionId: task.agentVersionId,
      };
      const revisions = await this.executions.revisionRequests(task.id);
      const result = await this.untilStopped(
        this.runtime.run({
          task,
          executionId,
          agentVersion,
          sandbox,
          token,
          revisions,
          artifacts: {
            submit: async (artifact) => ({
              artifactId: await this.executions.recordArtifact(
                source,
                artifact,
              ),
            }),
          },
          signal,
        }),
        signal,
      );
      if (result.outcome === 'completed') {
        await this.executions.complete(
          source,
          result.summary,
          task.review.artifactKinds,
        );
      } else {
        await this.executions.fail(executionId, 'agent_failed', result.error);
      }
    } catch (error) {
      await this.failed(executionId, error);
    } finally {
      timers.forEach(clearTimeout);
      // Also when provisioning was abandoned: the provisioner finds what
      // the execution left behind by its ID.
      await this.destroy(task.organizationId, executionId, sandbox);
    }
  }

  /** Records why an execution ended early. */
  private async failed(executionId: string, error: unknown): Promise<void> {
    if (error instanceof Stopped) {
      switch (error.reason) {
        case 'cancelled':
          return this.executions.cancelled(executionId);
        case 'timeout':
          return this.executions.fail(
            executionId,
            'timeout',
            `The run took longer than ${seconds(this.options.runTimeoutMs)}`,
          );
        case 'provisioning-timeout':
          return this.executions.fail(
            executionId,
            'infrastructure',
            `Provisioning took longer than ${seconds(this.options.provisioningTimeoutMs)}`,
          );
        case 'interrupted':
          return this.executions.fail(
            executionId,
            'interrupted',
            'Hephaestus shut down while it ran',
          );
        case 'lost':
          // Already ended by a reaper.
          return;
      }
    }
    if (error instanceof RunnerFailure) {
      return this.executions.fail(
        executionId,
        error.reason,
        error.message,
        error.retryable,
      );
    }
    this.logger.warn(`Execution ${executionId} failed: ${String(error)}`);
    return this.executions.fail(
      executionId,
      'infrastructure',
      error instanceof Error ? error.message : String(error),
    );
  }

  private async destroy(
    organizationId: string,
    executionId: string,
    sandbox: Sandbox | null,
  ): Promise<void> {
    try {
      await this.provisioner.destroy({
        organizationId,
        executionId,
        reference: sandbox?.reference ?? null,
      });
      if (sandbox) {
        await this.executions.sandboxDestroyed(executionId);
      }
    } catch (error) {
      // The reaper doesn't see it any more; the provisioner's own expiry
      // (workspaces) is the backstop.
      this.logger.warn(
        `Destroying the sandbox of execution ${executionId} failed: ${String(error)}`,
      );
    }
  }

  /**
   * `work`, unless the execution is stopped: then it gets the grace period
   * to wind down, and is abandoned (`Stopped`) either way.
   */
  private async untilStopped<T>(
    work: Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    // A rejection after it was abandoned is no one's to handle.
    work.catch(() => undefined);
    const stopped = new Promise<never>((_, reject) => {
      const giveUp = () => {
        setTimeout(
          () => reject(signal.reason as Error),
          this.options.stopGraceMs,
        ).unref();
      };
      if (signal.aborted) {
        giveUp();
      } else {
        signal.addEventListener('abort', giveUp, { once: true });
      }
    });
    stopped.catch(() => undefined);
    let result: T;
    try {
      result = await Promise.race([work, stopped]);
    } catch (error) {
      throw signal.aborted ? (signal.reason as Error) : error;
    }
    if (signal.aborted) {
      // Whatever it returned, the execution was stopped.
      throw signal.reason as Error;
    }
    return result;
  }
}
