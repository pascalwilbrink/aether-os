import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import type { ApiTypes } from '@hephaestus/core';
import type { TaskResponse } from '@hephaestus/tasks';

import {
  AgentRuntime,
  type AgentRunInput,
  type AgentRunResult,
  type BranchConflict,
  type FailedCheck,
} from './agent-runtime.js';
import { BudgetExceededError } from '@hephaestus/models';

import { Housekeeping } from './housekeeping.js';
import { ExecutionPreparer } from './execution-preparer.js';
import { ExecutionReaper, seconds } from './execution-reaper.js';
import { ExecutionsService } from './executions.service.js';
import { RunnerFailure } from './runner.errors.js';
import { BranchConflictError, type Checkout } from './repository-checkouts.js';
import { RUNNER_OPTIONS, type RunnerOptions } from './runner.options.js';
import type { Sandbox } from './sandbox-provisioner.js';
import { Verifier } from './verifier.js';

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
    private readonly preparer: ExecutionPreparer,
    private readonly runtime: AgentRuntime,
    private readonly verifier: Verifier,
    private readonly housekeeping: Housekeeping,
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
    // Outside executions: pull requests to open, branches to delete, paused
    // tasks whose budgets have room again.
    await this.housekeeping.run();
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
    let checkout: Checkout | null = null;

    try {
      await this.untilStopped(this.preparer.assertBudget(task), signal);
      const agentVersion = await this.untilStopped(
        this.preparer.agentVersion(task),
        signal,
      );
      if (
        task.acceptanceCriteria.some(({ check }) => check.type === 'command') &&
        !agentVersion.runtime.sandboxRequired
      ) {
        throw new RunnerFailure(
          "Command checks run in the task's sandbox, and its agent version runs without one (runtime.sandboxRequired)",
          'infrastructure',
          false,
        );
      }
      const token = await this.untilStopped(this.preparer.token(task), signal);
      sandbox = await this.untilStopped(
        this.preparer.sandbox(task, executionId, agentVersion, signal),
        signal,
      );
      checkout = await this.untilStopped(
        this.preparer.checkout(task, token, sandbox),
        signal,
      );
      if (checkout) {
        await this.executions.recordRepository(executionId, {
          linkId: checkout.linkId,
          fullName: checkout.fullName,
          branch: checkout.branch,
          baseSha: checkout.baseSha,
          headSha: null,
          commits: null,
          uncommittedChanges: null,
          pushedSha: null,
        });
      }
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
      const input: AgentRunInput = {
        task,
        executionId,
        agentVersion,
        sandbox,
        token,
        revisions: await this.executions.revisionRequests(task.id),
        failedChecks: [],
        repository: checkout && {
          fullName: checkout.fullName,
          path: checkout.path,
          branch: checkout.branch,
          startedFrom: checkout.startedFrom,
        },
        artifacts: {
          submit: async (artifact) => ({
            artifactId: await this.executions.recordArtifact(source, artifact),
          }),
        },
        signal,
      };
      await this.runAndVerify(task, source, input, sandbox, checkout, signal);
    } catch (error) {
      await this.failed(executionId, error);
    } finally {
      timers.forEach(clearTimeout);
      if (checkout) {
        await this.preparer.cleanup(checkout);
      }
      // Also when provisioning was abandoned: the provisioner finds what
      // the execution left behind by its ID.
      await this.destroy(task.organizationId, executionId, sandbox);
    }
  }

  /**
   * Runs the agent, then checks its work against the task's acceptance
   * criteria (docs/tasks.md, Verification), while its sandbox is still
   * there. Failures go back to the agent, up to `maxVerificationRounds`
   * runs; then the execution fails `verification_failed`.
   */
  private async runAndVerify(
    task: TaskResponse,
    source: Parameters<ExecutionsService['complete']>[0],
    input: AgentRunInput,
    sandbox: Sandbox | null,
    checkout: Checkout | null,
    signal: AbortSignal,
  ): Promise<void> {
    const { executionId } = input;
    let failedChecks: FailedCheck[] = [];
    let conflict: BranchConflict | null = null;
    for (let round = 1; ; round++) {
      const result: AgentRunResult = await this.untilStopped(
        this.runtime.run({ ...input, failedChecks, conflict }),
        signal,
      );
      if (result.outcome === 'failed') {
        return this.executions.fail(executionId, 'agent_failed', result.error);
      }
      if (!(await this.executions.startVerifying(source, result.summary))) {
        return this.executions.fail(
          executionId,
          'agent_failed',
          'The agent finished without an outcome (no answer, no artifacts)',
        );
      }

      const results = await this.untilStopped(
        this.executions
          .artifactsToVerify(task.id, executionId)
          .then((artifacts) =>
            this.verifier.verify({
              criteria: task.acceptanceCriteria,
              artifacts,
              sandbox,
            }),
          ),
        signal,
      );
      const failed = results.filter((r) => r.outcome === 'failed');
      const retry =
        failed.length > 0 && round < this.options.maxVerificationRounds;
      await this.executions.recordVerification(source, round, results, retry);

      if (failed.length === 0) {
        if (checkout && sandbox) {
          try {
            await this.deliverCommits(
              task,
              source,
              input,
              checkout,
              sandbox,
              result.summary,
              signal,
            );
          } catch (error) {
            if (!(error instanceof BranchConflictError)) {
              throw error;
            }
            if (round >= this.options.maxVerificationRounds) {
              // Out of rounds: the next execution starts from the branch's head.
              throw new RunnerFailure(
                `The commits still conflict with ${error.branch} after ${round} rounds; the task runs again from its head`,
                'infrastructure',
              );
            }
            // docs/git.md: the conflict goes back to the agent, and counts as a round.
            const files = await this.untilStopped(
              this.preparer.startConflictResolution(checkout, sandbox, error),
              signal,
            );
            await this.executions.returnToAgent(source, 'branch-conflict');
            conflict = { branch: error.branch, files };
            failedChecks = [];
            continue;
          }
        }
        return this.executions.complete(
          source,
          result.summary,
          task.review.artifactKinds,
        );
      }
      if (!retry) {
        return this.executions.fail(
          executionId,
          'verification_failed',
          `Acceptance criteria still failing after ${round} rounds: ${failed.map((r) => r.key).join(', ')}`,
        );
      }
      conflict = null;
      failedChecks = failed.map((r) => ({
        key: r.key,
        description: descriptionOf(task.acceptanceCriteria, r.key),
        output: r.output,
      }));
    }
  }

  /**
   * While the sandbox is still there: what the agent committed comes out,
   * is pushed to the task tree's branch (docs/git.md), and becomes the
   * execution's `pull_request` artifact, its outcome (in a revision run,
   * revising the one a reviewer sent back).
   */
  private async deliverCommits(
    task: TaskResponse,
    source: Parameters<ExecutionsService['complete']>[0],
    input: AgentRunInput,
    checkout: Checkout,
    sandbox: Sandbox,
    summary: string,
    signal: AbortSignal,
  ): Promise<void> {
    const collected = await this.untilStopped(
      this.preparer.collect(checkout, sandbox),
      signal,
    );
    const repository = {
      linkId: checkout.linkId,
      fullName: checkout.fullName,
      branch: checkout.branch,
      baseSha: checkout.baseSha,
      ...collected,
      pushedSha: null as string | null,
    };
    if (collected.commits && collected.headSha) {
      repository.pushedSha = await this.untilStopped(
        this.preparer.push(checkout, task, input.token, collected.headSha),
        signal,
      );
      await this.executions.recordPullRequest(source, {
        kind: 'pull_request',
        title: task.title,
        primary: true,
        revisionOf: input.revisions.find(
          (artifact) => artifact.kind === 'pull_request',
        )?.id,
        linkId: checkout.linkId,
        repository: checkout.fullName,
        branch: checkout.branch,
        baseBranch: checkout.baseBranch,
        headSha: repository.pushedSha,
        description: `${summary.trim()}\n\n---\nAether-Task: ${task.id}`,
      });
    }
    await this.executions.recordRepository(source.executionId, repository);
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
    if (error instanceof BudgetExceededError) {
      return this.executions.pause(executionId, error.scope, error.message);
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
      await this.preparer.release({
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

function descriptionOf(
  criteria: ApiTypes.AcceptanceCriterion[],
  key: string,
): string {
  return (
    criteria.find((criterion) => criterion.key === key)?.description ?? key
  );
}
