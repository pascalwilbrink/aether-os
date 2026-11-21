import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenancyModule } from '@hephaestus/tenancy';
import { ToolsModule } from '@hephaestus/tools';

import { AgentVersionChecks } from './agent-version-checks.js';
import { AgentVersionChecksController } from './agent-version-checks.controller.js';
import { AgentVersionEntity } from './agent-version.entity.js';
import { AgentVersionMapper } from './agent-version.mapper.js';
import { AgentVersionsService } from './agent-versions.service.js';
import { AgentEntity } from './agent.entity.js';
import { AgentMapper } from './agent.mapper.js';
import { AgentsService } from './agents.service.js';

/**
 * Hephaestus's copy of Agora's agents and versions (from `agora.events`),
 * and Agora's check of a version's tools.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AgentEntity, AgentVersionEntity]),
    TenancyModule,
    ToolsModule,
  ],
  controllers: [AgentVersionChecksController],
  providers: [
    AgentsService,
    AgentMapper,
    AgentVersionsService,
    AgentVersionMapper,
    AgentVersionChecks,
  ],
  exports: [AgentsService, AgentVersionsService],
})
export class AgentsModule {}
