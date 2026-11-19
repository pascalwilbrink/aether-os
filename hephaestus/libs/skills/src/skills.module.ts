import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenancyModule } from '@hephaestus/tenancy';

import { SkillVersionEntity } from './skill-version.entity.js';
import { SkillEntity } from './skill.entity.js';
import { SkillMapper } from './skill.mapper.js';
import { SkillsController } from './skills.controller.js';
import { SkillsService } from './skills.service.js';

/** Skills agent versions pin (libs/skills). */
@Module({
  imports: [
    TypeOrmModule.forFeature([SkillEntity, SkillVersionEntity]),
    TenancyModule,
  ],
  controllers: [SkillsController],
  providers: [SkillMapper, SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
