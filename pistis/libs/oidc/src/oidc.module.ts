import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { Env } from '@pistis/core';
import { UsersModule } from '@pistis/users';

import {
  HttpPolisDirectory,
  POLIS_DIRECTORY_OPTIONS,
  type PolisDirectoryOptions,
} from './http-polis-directory.js';
import { InteractionsController } from './interactions.controller.js';
import { OidcPayloadEntity } from './oidc-payload.entity.js';
import { OidcProviderService } from './oidc-provider.service.js';
import { PolisDirectory } from './polis-directory.js';

@Module({
  imports: [TypeOrmModule.forFeature([OidcPayloadEntity]), UsersModule],
  controllers: [InteractionsController],
  providers: [
    OidcProviderService,
    {
      provide: POLIS_DIRECTORY_OPTIONS,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<Env, true>,
      ): PolisDirectoryOptions => ({
        baseUrl: config.get('POLIS_URL', { infer: true }),
      }),
    },
    { provide: PolisDirectory, useClass: HttpPolisDirectory },
  ],
  exports: [OidcProviderService],
})
export class OidcModule {}
