import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ServiceTokens, type Env } from '@pistis/core';
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
import { signingKeys } from './signing-keys.js';
import {
  PistisServiceTokens,
  SIGNING_KEYS,
  TokenSigner,
} from './token-signer.js';
import { UpstreamSignInService } from './upstream/upstream-sign-in.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([OidcPayloadEntity]), UsersModule],
  controllers: [InteractionsController],
  providers: [
    OidcProviderService,
    UpstreamSignInService,
    {
      provide: SIGNING_KEYS,
      inject: [ConfigService],
      // Outside production without PISTIS_SIGNING_KEYS: one key per start.
      useFactory: (config: ConfigService<Env, true>) =>
        signingKeys(config.get('PISTIS_SIGNING_KEYS', { infer: true })),
    },
    TokenSigner,
    { provide: ServiceTokens, useClass: PistisServiceTokens },
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
  exports: [OidcProviderService, SIGNING_KEYS, TokenSigner],
})
export class OidcModule {}
