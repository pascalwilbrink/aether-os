import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ModelsModule } from '@hephaestus/models';
import { SkillsModule } from '@hephaestus/skills';
import { TenancyModule } from '@hephaestus/tenancy';
import { ToolsModule } from '@hephaestus/tools';

import { AgentBudgetController } from './agent-budget.controller.js';
import { AgentModelKeysController } from './agent-model-keys.controller.js';
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
 * the per-agent model keys and budgets, and Agora's check of a version's
 * model, tools and skills.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AgentEntity, AgentVersionEntity]),
    TenancyModule,
    ModelsModule,
    ToolsModule,
    SkillsModule,
  ],
  controllers: [
    AgentModelKeysController,
    AgentBudgetController,
    AgentVersionChecksController,
  ],
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
