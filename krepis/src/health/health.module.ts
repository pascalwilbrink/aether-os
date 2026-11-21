import {
  Module,
  type DynamicModule,
  type FactoryProvider,
  type ModuleMetadata,
} from '@nestjs/common';

import { HealthRegistry, type HealthCheck } from './health-check.js';
import { HealthController } from './health.controller.js';
import { HEALTH_OPTIONS } from './health.options.js';
import { HealthService } from './health.service.js';

export interface HealthModuleOptions {
  service: string;
  imports?: ModuleMetadata['imports'];
  inject?: FactoryProvider['inject'];
  /** Checks from configuration: `serviceCheck('polis', POLIS_URL)`, … */
  checks?: (...args: never[]) => HealthCheck[] | Promise<HealthCheck[]>;
}

/**
 * `/health` and `/health/live` for a service (docs/engineering.md, Health
 * checks). Import it once, in the app module; it's global, so feature
 * modules can add checks to `HealthRegistry`.
 *
 * ```ts
 * HealthModule.forRoot({
 *   service: 'agora',
 *   inject: [ConfigService],
 *   checks: (config: ConfigService<Env, true>) => [
 *     serviceCheck('polis', config.get('POLIS_URL', { infer: true })),
 *   ],
 * })
 * ```
 */
@Module({})
export class HealthModule {
  static forRoot(options: HealthModuleOptions): DynamicModule {
    return {
      module: HealthModule,
      global: true,
      imports: options.imports ?? [],
      controllers: [HealthController],
      providers: [
        HealthRegistry,
        HealthService,
        {
          provide: HEALTH_OPTIONS,
          inject: options.inject ?? [],
          useFactory: async (...args: never[]) => ({
            service: options.service,
            checks: options.checks ? await options.checks(...args) : [],
          }),
        },
      ],
      exports: [HealthRegistry],
    };
  }
}
