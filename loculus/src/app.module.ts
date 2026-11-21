import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AuthModule,
  DatabaseModule,
  HealthModule,
  loculusConfigModule,
  serviceCheck,
  type Env,
} from '@loculus/core';
import { FilesModule } from '@loculus/files';

// Validation, the /v1 prefix and problem details: configureHttpApp (main.ts).
// Loculus publishes and consumes no events yet.
@Module({
  imports: [
    loculusConfigModule(),
    DatabaseModule,
    // /health and /health/live (Krepis): the database, and what it calls.
    HealthModule.forRoot({
      service: 'loculus',
      inject: [ConfigService],
      checks: (config: ConfigService<Env, true>) => [
        serviceCheck('pistis', config.get('PISTIS_ISSUER', { infer: true })),
      ],
    }),
    // Pistis tokens on every request, and the permission table (Krepis).
    AuthModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        issuer: config.get('PISTIS_ISSUER', { infer: true }),
        jwks: config.get('PISTIS_JWKS', { infer: true }),
      }),
    }),
    FilesModule,
  ],
})
export class AppModule {}
