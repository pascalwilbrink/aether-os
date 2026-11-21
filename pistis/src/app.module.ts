import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AuthModule,
  DatabaseModule,
  HealthModule,
  pistisConfigModule,
  serviceCheck,
  type Env,
} from '@pistis/core';
import {
  OidcModule,
  publicKeys,
  SIGNING_KEYS,
  type SigningKeys,
} from '@pistis/oidc';
import { ServiceAccountsModule } from '@pistis/service-accounts';
import { UsersModule } from '@pistis/users';

// Validation, the /v1 prefix and problem details: configurePistisApp (main.ts).
@Module({
  imports: [
    pistisConfigModule(),
    DatabaseModule,
    // /health and /health/live (Krepis): the database, and what it calls.
    HealthModule.forRoot({
      service: 'pistis',
      inject: [ConfigService],
      checks: (config: ConfigService<Env, true>) => [
        serviceCheck('polis', config.get('POLIS_URL', { infer: true })),
      ],
    }),
    UsersModule,
    ServiceAccountsModule,
    OidcModule,
    // Pistis's API takes Pistis's tokens, checked against its own keys.
    AuthModule.forRootAsync({
      imports: [OidcModule],
      inject: [ConfigService, SIGNING_KEYS],
      useFactory: (config: ConfigService<Env, true>, keys: SigningKeys) => ({
        issuer: config.get('PISTIS_ISSUER', { infer: true }),
        jwks: publicKeys(keys),
      }),
    }),
  ],
})
export class AppModule {}
