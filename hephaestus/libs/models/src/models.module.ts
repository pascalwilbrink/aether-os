import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ServiceTokens, type Env } from '@hephaestus/core';
import { TenancyModule } from '@hephaestus/tenancy';

import { ModelGateway } from './model-gateway.js';
import { HttpPylon, Pylon } from './pylon.js';
import { HttpPylonModels, PylonModels } from './pylon-models.js';

/**
 * Hephaestus's side of Pylon, the model gateway (../docs/pylon.md): agents'
 * models pointed at its pass-through, budget checks, task trees' budgets
 * and executions' usage.
 */
@Module({
  imports: [TenancyModule],
  providers: [
    {
      provide: PylonModels,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new HttpPylonModels(config.get('PYLON_URL', { infer: true })),
    },
    {
      provide: Pylon,
      inject: [ConfigService, ServiceTokens],
      useFactory: (config: ConfigService<Env, true>, tokens: ServiceTokens) =>
        new HttpPylon(config.get('PYLON_URL', { infer: true }), tokens),
    },
    ModelGateway,
  ],
  exports: [ModelGateway, Pylon],
})
export class ModelsModule {}
