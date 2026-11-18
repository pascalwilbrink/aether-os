import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { Env } from '@hephaestus/core';
import { AgentsModule } from '@hephaestus/agents';
import { ModelGateway, ModelsModule } from '@hephaestus/models';
import { TasksModule } from '@hephaestus/tasks';

import { AgentRuntime } from './agent-runtime.js';
import { EchoAgentRuntime, NoAgentRuntime } from './echo-agent-runtime.js';
import { ExecutionEntity } from './execution.entity.js';
import { MastraAgentRuntime } from './mastra-agent-runtime.js';
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
    ModelsModule,
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
