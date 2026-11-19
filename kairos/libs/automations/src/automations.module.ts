import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenancyModule } from '@kairos/tenancy';

import { AutomationRunEntity } from './automation-run.entity.js';
import { AutomationEntity } from './automation.entity.js';
import { AutomationMapper } from './automation.mapper.js';
import { AutomationRunsService } from './automation-runs.service.js';
import { AutomationsController } from './automations.controller.js';
import { AutomationsService } from './automations.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AutomationEntity, AutomationRunEntity]),
    TenancyModule,
  ],
  controllers: [AutomationsController],
  providers: [AutomationsService, AutomationRunsService, AutomationMapper],
  exports: [AutomationsService, AutomationRunsService],
})
export class AutomationsModule {}
