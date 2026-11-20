import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AuthModule,
  DatabaseModule,
  loculusConfigModule,
  type Env,
} from '@loculus/core';
import { FilesModule } from '@loculus/files';

// Validation, the /v1 prefix and problem details: configureHttpApp (main.ts).
// Loculus publishes and consumes no events yet.
@Module({
  imports: [
    loculusConfigModule(),
    DatabaseModule,
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
