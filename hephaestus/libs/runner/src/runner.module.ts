import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { Env } from '@hephaestus/core';
import { AgentsModule } from '@hephaestus/agents';
import { ArtifactsModule } from '@hephaestus/artifacts';
import { ModelGateway, ModelsModule } from '@hephaestus/models';
import { WorkspacesModule, WorkspacesService } from '@hephaestus/workspaces';
import { TasksModule } from '@hephaestus/tasks';

import { AgentRuntime } from './agent-runtime.js';
import { EchoAgentRuntime, NoAgentRuntime } from './echo-agent-runtime.js';
import { ExecutionEntity } from './execution.entity.js';
import { MastraAgentRuntime } from './mastra-agent-runtime.js';
import { ExecutionMapper } from './execution.mapper.js';
import { ExecutionPreparer } from './execution-preparer.js';
import { ExecutionReaper } from './execution-reaper.js';
import { ExecutionsController } from './executions.controller.js';
import { ExecutionsService } from './executions.service.js';
import { DockerSandboxDriver } from './docker-sandbox-driver.js';
import { NoSandboxProvisioner } from './no-sandbox-provisioner.js';
import { Deliveries } from './deliveries.js';
import { GitClient } from './git-client.js';
import { GitHubPullRequests, PullRequests } from './pull-requests.js';
import { TaskRepositoryAccess } from './task-repository-access.js';
import { PistisTaskTokens } from './pistis-task-tokens.js';
import { RepositoryCheckouts } from './repository-checkouts.js';
import {
  HttpRepositoryTokens,
  NoRepositoryTokens,
  RepositoryTokens,
} from './repository-tokens.js';
import { RUNNER_OPTIONS, runnerOptionsFrom } from './runner.options.js';
import { SandboxDriver } from './sandbox-driver.js';
import { SandboxProvisioner } from './sandbox-provisioner.js';
import { TaskRunner } from './task-runner.js';
import { TaskTokens } from './task-tokens.js';
import { Verifier } from './verifier.js';
import {
  SANDBOX_OPTIONS,
  WorkspaceSandboxProvisioner,
  type SandboxOptions,
} from './workspace-sandbox-provisioner.js';

/**
 * The task runner (docs/tasks.md, Task lifecycle): executions, the queue
 * consumer, heartbeats and timeouts. The agent runtime, sandbox provisioner
 * and task tokens are ports, bound here from the configuration.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ExecutionEntity]),
    TasksModule,
    AgentsModule,
    ModelsModule,
    WorkspacesModule,
    ArtifactsModule,
  ],
  controllers: [ExecutionsController],
  providers: [
    {
      provide: RUNNER_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        runnerOptionsFrom((key) => config.get(key, { infer: true })),
    },
    {
      provide: AgentRuntime,
      inject: [ConfigService, ModelGateway],
      useFactory: (config: ConfigService<Env, true>, gateway: ModelGateway) => {
        switch (config.get('AGENT_RUNTIME', { infer: true })) {
          case 'mastra':
            return new MastraAgentRuntime(gateway);
          case 'echo':
            return new EchoAgentRuntime();
          default:
            return new NoAgentRuntime();
        }
      },
    },
    {
      provide: SANDBOX_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): SandboxOptions => ({
        image: config.get('SANDBOX_IMAGE', { infer: true }),
        user: config.get('SANDBOX_USER', { infer: true }),
        cpus: config.get('SANDBOX_CPUS', { infer: true }),
        memoryMb: config.get('SANDBOX_MEMORY_MB', { infer: true }),
        pidsLimit: config.get('SANDBOX_PIDS_LIMIT', { infer: true }),
        workspaceMb: config.get('SANDBOX_WORKSPACE_MB', { infer: true }),
        lifetimeMs:
          config.get('RUNNER_PROVISIONING_TIMEOUT_MS', { infer: true }) +
          config.get('RUNNER_RUN_TIMEOUT_MS', { infer: true }),
      }),
    },
    // Connects to Docker only when used.
    { provide: SandboxDriver, useFactory: () => new DockerSandboxDriver() },
    {
      provide: SandboxProvisioner,
      inject: [
        ConfigService,
        WorkspacesService,
        SandboxDriver,
        SANDBOX_OPTIONS,
      ],
      useFactory: (
        config: ConfigService<Env, true>,
        workspaces: WorkspacesService,
        driver: SandboxDriver,
        options: SandboxOptions,
      ) =>
        config.get('SANDBOX_DRIVER', { infer: true }) === 'docker'
          ? new WorkspaceSandboxProvisioner(workspaces, driver, options)
          : new NoSandboxProvisioner(),
    },
    {
      provide: TaskTokens,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new PistisTaskTokens({
          issuer: config.get('PISTIS_ISSUER', { infer: true }),
          clientId: config.get('PISTIS_CLIENT_ID', { infer: true }),
          clientSecret: config.get('PISTIS_CLIENT_SECRET', { infer: true }),
        }),
    },
    {
      provide: RepositoryTokens,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = config.get('PROXENOS_URL', { infer: true });
        return url ? new HttpRepositoryTokens(url) : new NoRepositoryTokens();
      },
    },
    { provide: GitClient, useFactory: () => new GitClient() },
    RepositoryCheckouts,
    { provide: PullRequests, useFactory: () => new GitHubPullRequests() },
    TaskRepositoryAccess,
    Deliveries,
    ExecutionMapper,
    ExecutionsService,
    ExecutionReaper,
    ExecutionPreparer,
    Verifier,
    TaskRunner,
  ],
  exports: [ExecutionsService, TaskRunner],
})
export class RunnerModule {}
