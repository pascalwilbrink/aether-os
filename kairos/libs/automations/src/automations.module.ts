import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { Env } from '@kairos/core';

import { TenancyModule } from '@kairos/tenancy';

import { AutomationRunEntity } from './automation-run.entity.js';
import { AutomationEntity } from './automation.entity.js';
import { AutomationMapper } from './automation.mapper.js';
import { AutomationRunsService } from './automation-runs.service.js';
import { AutomationsController } from './automations.controller.js';
import { AutomationsService } from './automations.service.js';
import { ErgonClient } from './ergon-client.js';
import {
  ERGON_CLIENT_OPTIONS,
  HttpErgonClient,
  type ErgonClientOptions,
} from './http-ergon.client.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AutomationEntity, AutomationRunEntity]),
    TenancyModule,
  ],
  controllers: [AutomationsController],
  providers: [
    AutomationsService,
    AutomationRunsService,
    AutomationMapper,
    {
      provide: ERGON_CLIENT_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): ErgonClientOptions => ({
        baseUrl: config.get('ERGON_URL', { infer: true }),
      }),
    },
    { provide: ErgonClient, useClass: HttpErgonClient },
  ],
  exports: [AutomationsService, AutomationRunsService],
})
export class AutomationsModule {}
