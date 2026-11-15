import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { Env } from '@pistis/core';

import { AccountsService } from './accounts.service.js';
import { PasswordCredentialEntity } from './password-credential.entity.js';
import { PASSWORD_HASHER_OPTIONS, PasswordHasher } from './password-hasher.js';
import { PasswordsService } from './passwords.service.js';
import { UserProviderEntity } from './user-provider.entity.js';
import { UserProviderMapper } from './user-provider.mapper.js';
import { UserProvidersService } from './user-providers.service.js';
import { UserEntity } from './user.entity.js';
import { UserMapper } from './user.mapper.js';
import {
  PasswordsController,
  UserProvidersController,
  UsersController,
} from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      UserProviderEntity,
      PasswordCredentialEntity,
    ]),
  ],
  controllers: [UsersController, UserProvidersController, PasswordsController],
  providers: [
    UsersService,
    UserMapper,
    UserProvidersService,
    UserProviderMapper,
    AccountsService,
    PasswordsService,
    PasswordHasher,
    {
      provide: PASSWORD_HASHER_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        cost: config.get('PASSWORD_SCRYPT_COST', { infer: true }),
      }),
    },
  ],
  exports: [
    UsersService,
    UserProvidersService,
    AccountsService,
    PasswordsService,
  ],
})
export class UsersModule {}
