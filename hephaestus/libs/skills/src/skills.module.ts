import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SkillVersionEntity } from './skill-version.entity.js';
import { SkillEntity } from './skill.entity.js';
import { SkillMapper } from './skill.mapper.js';
import { SkillsService } from './skills.service.js';

/** Hephaestus's copy of Agora's skills, which runs read (libs/skills). */
@Module({
  imports: [TypeOrmModule.forFeature([SkillEntity, SkillVersionEntity])],
  providers: [SkillMapper, SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
