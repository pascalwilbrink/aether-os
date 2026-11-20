import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentEntity } from './agent.entity.js';
import { AgentsService } from './agents.service.js';

/** Pylon's copy of Agora's agents (`agora.events`). */
@Module({
  imports: [TypeOrmModule.forFeature([AgentEntity])],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
