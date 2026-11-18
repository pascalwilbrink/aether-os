import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { Env } from '@hephaestus/core';
import { AgentsModule } from '@hephaestus/agents';
import { TasksModule } from '@hephaestus/tasks';

import { AgentRuntime } from './agent-runtime.js';
import { EchoAgentRuntime, NoAgentRuntime } from './echo-agent-runtime.js';
import { ExecutionEntity } from './execution.entity.js';
import { ExecutionMapper } from './execution.mapper.js';
import { ExecutionReaper } from './execution-reaper.js';
import { ExecutionsController } from './executions.controller.js';
import { ExecutionsService } from './executions.service.js';
import { NoSandboxProvisioner } from './no-sandbox-provisioner.js';
import { PistisTaskTokens } from './pistis-task-tokens.js';
import { RUNNER_OPTIONS, runnerOptionsFrom } from './runner.options.js';
import { SandboxProvisioner } from './sandbox-provisioner.js';
import { TaskRunner } from './task-runner.js';
import { TaskTokens } from './task-tokens.js';

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
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('AGENT_RUNTIME', { infer: true }) === 'echo'
          ? new EchoAgentRuntime()
          : new NoAgentRuntime(),
    },
    { provide: SandboxProvisioner, useClass: NoSandboxProvisioner },
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
    ExecutionMapper,
    ExecutionsService,
    ExecutionReaper,
    TaskRunner,
  ],
  exports: [ExecutionsService, TaskRunner],
})
export class RunnerModule {}
