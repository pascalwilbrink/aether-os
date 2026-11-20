import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { Env } from '@agora/core';
import { TenancyModule } from '@agora/tenancy';

import { AgentVersionChecker } from './agent-version-checker.js';
import { AgentVersionEntity } from './agent-version.entity.js';
import { AgentVersionMapper } from './agent-version.mapper.js';
import { AgentVersionsController } from './agent-versions.controller.js';
import { AgentVersionsService } from './agent-versions.service.js';
import { AgentEntity } from './agent.entity.js';
import { AgentMapper } from './agent.mapper.js';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';
import {
  HEPHAESTUS_CLIENT_OPTIONS,
  HttpAgentVersionChecker,
  type HephaestusClientOptions,
} from './http-agent-version-checker.js';

/** Agents and their versions; new versions are checked by Hephaestus. */
@Module({
  imports: [
    TypeOrmModule.forFeature([AgentEntity, AgentVersionEntity]),
    TenancyModule,
  ],
  controllers: [AgentsController, AgentVersionsController],
  providers: [
    AgentsService,
    AgentMapper,
    AgentVersionsService,
    AgentVersionMapper,
    {
      provide: HEPHAESTUS_CLIENT_OPTIONS,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<Env, true>,
      ): HephaestusClientOptions => ({
        baseUrl: config.get('HEPHAESTUS_URL', { infer: true }),
      }),
    },
    { provide: AgentVersionChecker, useClass: HttpAgentVersionChecker },
  ],
  exports: [AgentsService, AgentVersionsService],
})
export class AgentsModule {}
