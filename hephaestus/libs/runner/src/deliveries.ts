import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { ArtifactsService } from '@hephaestus/artifacts';
import {
  OnDomainEvent,
  type DomainEvent,
  type HephaestusEventTypes,
} from '@hephaestus/core';
import { TaskQueue, TasksService, type TaskResponse } from '@hephaestus/tasks';

import { GitClient } from './git-client.js';
import { PullRequests } from './pull-requests.js';
import { RunnerFailure } from './runner.errors.js';
import { RUNNER_OPTIONS, type RunnerOptions } from './runner.options.js';
import { TaskRepositoryAccess } from './task-repository-access.js';

/** How long a runner holds a delivery or a cleanup it took. */
const LEASE_MS = 5 * 60_000;
/** A branch cleanup that failed is tried again this much later. */
const CLEANUP_RETRY_MS = 10 * 60_000;

/**
 * What happens after a task's work is done, outside any execution
 * (docs/git.md, Branches and pull requests), each round of the runner:
 *
 * - **Delivery:** a `delivering` task with `pull_request` artifacts not
 *   opened yet gets them opened (or the branch's open one adopted and
 *   updated) with a write token, then succeeds. Failures are retried with
 *   backoff, up to `RUNNER_MAX_INFRASTRUCTURE_FAILURES` tries; access
 *   refused, or the last try, fails the task.
 * - **Branch cleanup:** a task tree's branch is deleted when the tree
 *   fails or is cancelled, or its pull request is merged or closed
 *   (`TasksService.requestBranchCleanup`).
 *
 * Both are claimed with a lease (`TaskQueue`), so runners share them.
 */
@Injectable()
export class Deliveries {
  private readonly logger = new Logger(Deliveries.name);

  constructor(
    @Inject(RUNNER_OPTIONS) private readonly options: RunnerOptions,
    private readonly queue: TaskQueue,
    private readonly tasks: TasksService,
    private readonly artifacts: ArtifactsService,
    private readonly access: TaskRepositoryAccess,
    private readonly pullRequests: PullRequests,
    private readonly git: GitClient,
  ) {}

  /** Delivers what's due, then cleans up branches; one at a time each. */
  async run(): Promise<void> {
    for (
      let claimed = await this.queue.claimDelivery(LEASE_MS);
      claimed;
      claimed = await this.queue.claimDelivery(LEASE_MS)
    ) {
      await this.deliver(claimed.task, claimed.attempt);
    }
    for (
      let task = await this.queue.claimBranchCleanup(LEASE_MS);
      task;
      task = await this.queue.claimBranchCleanup(LEASE_MS)
    ) {
      await this.cleanUp(task);
    }
  }

  /** A failed or cancelled tree's branch goes. */
  @OnDomainEvent('hephaestus.task.failed')
  @OnDomainEvent('hephaestus.task.cancelled')
  async onTaskEnded(
    event: DomainEvent<
      HephaestusEventTypes.TaskFailed | HephaestusEventTypes.TaskCancelled
    >,
  ): Promise<void> {
    const task = await this.tasks.get(event.aggregateId);
    if (task.parentTaskId === null && task.repository) {
      await this.tasks.requestBranchCleanup(task.organizationId, task.id);
    }
  }

  private async deliver(task: TaskResponse, attempt: number): Promise<void> {
    try {
      const undelivered = await this.artifacts.undeliveredPullRequests(task.id);
      if (undelivered.length > 0) {
        const credentials = await this.access.write(task);
        for (const artifact of undelivered) {
          if (artifact.kind !== 'pull_request') continue;
          const pullRequest = await this.pullRequests.open({
            apiUrl: credentials.apiUrl,
            token: credentials.token,
            repository: artifact.repository,
            branch: artifact.branch,
            baseBranch: artifact.baseBranch,
            title: artifact.title,
            body: artifact.description,
          });
          await this.artifacts.markDelivered(artifact.id, pullRequest);
        }
      }
      await this.tasks.transition(
        task.organizationId,
        task.id,
        'succeed',
        null,
        {
          reason: 'delivered',
          outcome: await this.artifacts.outcome(task.id),
        },
      );
    } catch (error) {
      const retryable = !(error instanceof RunnerFailure) || error.retryable;
      const message = error instanceof Error ? error.message : String(error);
      if (retryable && attempt < this.options.maxInfrastructureFailures) {
        this.logger.warn(
          `Delivering task ${task.id} failed (try ${attempt}), retrying: ${message}`,
        );
        await this.tasks.deliveryRetryAt(
          task.id,
          new Date(
            Date.now() + this.options.retryBackoffMs * 2 ** (attempt - 1),
          ),
        );
        return;
      }
      this.logger.warn(`Delivering task ${task.id} failed: ${message}`);
      await this.tasks.transition(
        task.organizationId,
        task.id,
        'fail',
        'infrastructure',
        {
          reason: 'delivery-failed',
        },
      );
    }
  }

  private async cleanUp(task: TaskResponse): Promise<void> {
    const scratch = await mkdtemp(join(tmpdir(), 'aether-cleanup-'));
    try {
      const credentials = await this.access.write(task);
      await this.git.deleteBranch(
        scratch,
        credentials.cloneUrl,
        `aether/${task.id}`,
        {
          token: credentials.token,
        },
      );
      await this.tasks.branchCleanupDone(task.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof RunnerFailure && !error.retryable) {
        // The repository is gone or out of reach: nothing left to clean.
        this.logger.warn(`Not cleaning up aether/${task.id}: ${message}`);
        await this.tasks.branchCleanupDone(task.id);
      } else {
        this.logger.warn(
          `Cleaning up aether/${task.id} failed, retrying: ${message}`,
        );
        await this.tasks.branchCleanupDone(
          task.id,
          new Date(Date.now() + CLEANUP_RETRY_MS),
        );
      }
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }
}
