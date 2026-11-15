import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountsService } from './accounts.service.js';
import { UserProviderEntity } from './user-provider.entity.js';
import { UserProviderMapper } from './user-provider.mapper.js';
import { UserProvidersService } from './user-providers.service.js';
import { UserEntity } from './user.entity.js';
import { UserMapper } from './user.mapper.js';
import {
  UserProvidersController,
  UsersController,
} from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, UserProviderEntity])],
  controllers: [UsersController, UserProvidersController],
  providers: [
    UsersService,
    UserMapper,
    UserProvidersService,
    UserProviderMapper,
    AccountsService,
  ],
  exports: [UsersService, UserProvidersService, AccountsService],
})
export class UsersModule {}
