import {
  Global,
  Module,
  type DynamicModule,
  type FactoryProvider,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AccessControl } from './access-control.service.js';
import { AuthGuard } from './auth.guard.js';
import { AUTH_OPTIONS, type AuthOptions } from './auth.options.js';
import {
  FixedPermissionEvaluator,
  PermissionEvaluator,
} from './permission-evaluator.js';
import { TokenVerifier } from './token-verifier.js';

/**
 * Authentication, tenancy and permissions for a service (docs/identity.md):
 * the global `AuthGuard`, the fixed permission table and `AccessControl`.
 *
 * ```ts
 * AuthModule.forRootAsync({
 *   inject: [ConfigService],
 *   useFactory: (config) => ({ issuer: config.get('PISTIS_ISSUER') }),
 * })
 * ```
 */
@Global()
@Module({})
export class AuthModule {
  static forRoot(options: AuthOptions): DynamicModule {
    return AuthModule.build({ provide: AUTH_OPTIONS, useValue: options });
  }

  static forRootAsync(
    options: Omit<
      FactoryProvider<AuthOptions | Promise<AuthOptions>>,
      'provide'
    > & { imports?: DynamicModule['imports'] },
  ): DynamicModule {
    const { imports, ...factory } = options;
    return {
      ...AuthModule.build({ provide: AUTH_OPTIONS, ...factory }),
      imports,
    };
  }

  private static build(
    options: DynamicModule['providers'] extends (infer P)[] | undefined
      ? P
      : never,
  ): DynamicModule {
    return {
      module: AuthModule,
      providers: [
        options,
        TokenVerifier,
        { provide: PermissionEvaluator, useClass: FixedPermissionEvaluator },
        AccessControl,
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
      exports: [AccessControl, PermissionEvaluator, TokenVerifier],
    };
  }
}
