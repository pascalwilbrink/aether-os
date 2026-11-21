import { Inject, Injectable } from '@nestjs/common';

import { AgentVersionsService } from '@hephaestus/agents';
import type { AgentVersion } from '@hephaestus/core';
import { BudgetExceededError, Pylon } from '@hephaestus/models';
import type { TaskResponse } from '@hephaestus/tasks';

import {
  RepositoryCheckouts,
  type BranchConflictError,
  type Checkout,
  type CollectedCommits,
} from './repository-checkouts.js';
import { RUNNER_OPTIONS, type RunnerOptions } from './runner.options.js';
import {
  SandboxProvisioner,
  type Sandbox,
  type SandboxRelease,
} from './sandbox-provisioner.js';
import type { AgentInputFile } from './agent-runtime.js';
import { TaskInputs } from './task-inputs.js';
import { TaskTokens } from './task-tokens.js';

/** Pistis issues task tokens for at most an hour. */
const MAX_TOKEN_SECONDS = 3600;

/**
 * What an execution needs before its agent runs, and gives back after: the
 * pinned agent version, a task token, a sandbox if the version needs one,
 * and the task's repository in it (`TaskRunner` wraps each step so a
 * stopped execution stops waiting).
 */
@Injectable()
export class ExecutionPreparer {
  constructor(
    @Inject(RUNNER_OPTIONS) private readonly options: RunnerOptions,
    private readonly agentVersions: AgentVersionsService,
    private readonly tokens: TaskTokens,
    private readonly provisioner: SandboxProvisioner,
    private readonly repositories: RepositoryCheckouts,
    private readonly pylon: Pylon,
    private readonly inputs: TaskInputs,
  ) {}

  /**
   * Before an execution starts work: throws `BudgetExceededError` when one
   * of the task's budgets ran out, so it pauses before using a sandbox.
   */
  async assertBudget(task: TaskResponse): Promise<void> {
    const exhausted = await this.pylon.exhausted({
      organizationId: task.organizationId,
      projectId: task.projectId,
      agentId: task.agentId,
      topLevelTaskId: task.topLevelTaskId,
    });
    if (exhausted) {
      throw new BudgetExceededError(exhausted.scope, exhausted.scopeId);
    }
  }

  agentVersion(task: TaskResponse): Promise<AgentVersion> {
    return this.agentVersions.findById(
      task.organizationId,
      task.agentId,
      task.agentVersionId,
    );
  }

  /** Valid for provisioning plus the run, capped at Pistis's hour. */
  token(task: TaskResponse): Promise<string> {
    return this.tokens.issue({
      serviceAccountId: task.serviceAccountId,
      organizationId: task.organizationId,
      projectId: task.projectId,
      taskId: task.id,
      taskTreeId: task.topLevelTaskId,
      agentId: task.agentId,
      agentVersionId: task.agentVersionId,
      expiresInSeconds: Math.min(
        MAX_TOKEN_SECONDS,
        Math.ceil(
          (this.options.provisioningTimeoutMs + this.options.runTimeoutMs) /
            1000,
        ),
      ),
    });
  }

  sandbox(
    task: TaskResponse,
    executionId: string,
    agentVersion: AgentVersion,
    signal: AbortSignal,
  ): Promise<Sandbox | null> {
    return this.provisioner.provision({
      task,
      executionId,
      agentVersion,
      signal,
    });
  }

  release(release: SandboxRelease): Promise<void> {
    return this.provisioner.destroy(release);
  }

  /** The task's repository in its sandbox, or null if it works in none (docs/git.md). */
  checkout(
    task: TaskResponse,
    token: string,
    sandbox: Sandbox | null,
  ): Promise<Checkout | null> {
    return this.repositories.checkout(task, token, sandbox);
  }

  /** The task's input files in its sandbox (`/workspace/inputs`). */
  inputFiles(
    task: TaskResponse,
    token: string,
    sandbox: Sandbox | null,
  ): Promise<AgentInputFile[]> {
    return this.inputs.copyInto(task, token, sandbox);
  }

  /** What the agent committed, out of the sandbox and into Hephaestus's clone. */
  collect(checkout: Checkout, sandbox: Sandbox): Promise<CollectedCommits> {
    return this.repositories.collect(checkout, sandbox);
  }

  /** Pushes the commits to the task tree's branch; its new head. */
  push(
    checkout: Checkout,
    task: TaskResponse,
    token: string,
    headSha: string,
  ): Promise<string> {
    return this.repositories.push(checkout, task, token, headSha);
  }

  /** Gives a branch conflict to the agent, in its sandbox; the conflicted files. */
  startConflictResolution(
    checkout: Checkout,
    sandbox: Sandbox,
    conflict: BranchConflictError,
  ): Promise<string[]> {
    return this.repositories.startConflictResolution(
      checkout,
      sandbox,
      conflict,
    );
  }

  cleanup(checkout: Checkout): Promise<void> {
    return this.repositories.cleanup(checkout);
  }
}
