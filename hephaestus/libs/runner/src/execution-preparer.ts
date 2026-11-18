import { Inject, Injectable } from '@nestjs/common';

import { AgentVersionsService } from '@hephaestus/agents';
import type { ApiTypes } from '@hephaestus/core';
import type { TaskResponse } from '@hephaestus/tasks';

import { RUNNER_OPTIONS, type RunnerOptions } from './runner.options.js';
import {
  SandboxProvisioner,
  type Sandbox,
  type SandboxRelease,
} from './sandbox-provisioner.js';
import { TaskTokens } from './task-tokens.js';

/** Pistis issues task tokens for at most an hour. */
const MAX_TOKEN_SECONDS = 3600;

/**
 * What an execution needs before its agent runs, and gives back after: the
 * pinned agent version, a task token, and a sandbox if the version needs
 * one (`TaskRunner` wraps each step so a stopped execution stops waiting).
 */
@Injectable()
export class ExecutionPreparer {
  constructor(
    @Inject(RUNNER_OPTIONS) private readonly options: RunnerOptions,
    private readonly agentVersions: AgentVersionsService,
    private readonly tokens: TaskTokens,
    private readonly provisioner: SandboxProvisioner,
  ) {}

  agentVersion(task: TaskResponse): Promise<ApiTypes.AgentVersionResponse> {
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
    agentVersion: ApiTypes.AgentVersionResponse,
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
}
