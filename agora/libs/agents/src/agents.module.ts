import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ServiceTokens, type Env } from '@agora/core';
import { SkillsModule } from '@agora/skills';
import { TenancyModule } from '@agora/tenancy';

import { AgentVersionChecker } from './agent-version-checker.js';
import { AgentVersionEntity } from './agent-version.entity.js';
import { AgentVersionMapper } from './agent-version.mapper.js';
import { AgentVersionsController } from './agent-versions.controller.js';
import { AgentVersionsService } from './agent-versions.service.js';
import { AgentEntity } from './agent.entity.js';
import { AgentMapper } from './agent.mapper.js';
import { AgentsAnnounceController } from './agents-announce.controller.js';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';
import {
  HEPHAESTUS_CLIENT_OPTIONS,
  HttpAgentVersionChecker,
  type HephaestusClientOptions,
} from './http-agent-version-checker.js';
import { HttpModelChecker } from './http-model-checker.js';

/** Agents and their versions; new versions' choices are checked by Pylon (the model), Hephaestus (tools) and the skills here. */
@Module({
  imports: [
    TypeOrmModule.forFeature([AgentEntity, AgentVersionEntity]),
    TenancyModule,
    SkillsModule,
  ],
  controllers: [
    AgentsController,
    AgentsAnnounceController,
    AgentVersionsController,
  ],
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
    {
      provide: AgentVersionChecker,
      inject: [HEPHAESTUS_CLIENT_OPTIONS, ServiceTokens, ConfigService],
      useFactory: (
        hephaestus: HephaestusClientOptions,
        tokens: ServiceTokens,
        config: ConfigService<Env, true>,
      ) =>
        new HttpAgentVersionChecker(
          hephaestus,
          tokens,
          new HttpModelChecker(
            { baseUrl: config.get('PYLON_URL', { infer: true }) },
            tokens,
          ),
        ),
    },
  ],
  exports: [AgentsService, AgentVersionsService],
})
export class AgentsModule {}
