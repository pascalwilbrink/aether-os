import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentEntity } from './agent.entity.js';
import { AssigneeDirectory } from './assignee-directory.service.js';
import { PersonEntity } from './person.entity.js';

/** Ergon's copies of Polis's persons and Agora's agents, to assign work to. */
@Module({
  imports: [TypeOrmModule.forFeature([PersonEntity, AgentEntity])],
  providers: [AssigneeDirectory],
  exports: [AssigneeDirectory],
})
export class AssigneesModule {}
