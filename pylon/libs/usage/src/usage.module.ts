import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentsModule } from '@pylon/agents';
import { TenancyModule } from '@pylon/tenancy';

import { BudgetEntity } from './budget.entity.js';
import { BudgetMapper } from './budget.mapper.js';
import { BudgetsController } from './budgets.controller.js';
import { BudgetsService } from './budgets.service.js';
import { ModelCallEntity } from './model-call.entity.js';
import { ModelCallsService } from './model-calls.service.js';
import { UsageController } from './usage.controller.js';

/** Metering and budgets (docs/models.md, Metering and Budgets). */
@Module({
  imports: [
    TypeOrmModule.forFeature([ModelCallEntity, BudgetEntity]),
    TenancyModule,
    AgentsModule,
  ],
  controllers: [BudgetsController, UsageController],
  providers: [ModelCallsService, BudgetMapper, BudgetsService],
  exports: [ModelCallsService, BudgetsService],
})
export class UsageModule {}
