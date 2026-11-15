import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { ZodSerializerDto } from '@pistis/core';

import { AccountsService } from './accounts.service.js';
import { ChangePasswordRequest } from './dto/change-password.request.js';
import { PasswordIdentityRequest } from './dto/password-identity.request.js';
import { CreateUserRequest } from './dto/create-user.request.js';
import { LinkUserProviderRequest } from './dto/link-user-provider.request.js';
import { ListUserProvidersQuery } from './dto/list-user-providers.query.js';
import { ListUsersQuery } from './dto/list-users.query.js';
import { UpdateUserRequest } from './dto/update-user.request.js';
import { UserPage } from './dto/user-page.response.js';
import { UserParams } from './dto/user.params.js';
import { UserProviderPage } from './dto/user-provider-page.response.js';
import { UserProviderParams } from './dto/user-provider.params.js';
import { UserProviderResponse } from './dto/user-provider.response.js';
import { UserResponse } from './dto/user.response.js';
import { PasswordsService } from './passwords.service.js';
import { UserProvidersService } from './user-providers.service.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly accounts: AccountsService,
  ) {}

  @Post()
  @ZodSerializerDto(UserResponse)
  create(@Body() body: CreateUserRequest) {
    return this.accounts.createUser(body);
  }

  @Get()
  @ZodSerializerDto(UserPage)
  list(@Query() query: ListUsersQuery) {
    return this.users.list(query);
  }

  @Get(':userId')
  @ZodSerializerDto(UserResponse)
  findById(@Param() { userId }: UserParams) {
    return this.users.findById(userId);
  }

  @Put(':userId')
  @ZodSerializerDto(UserResponse)
  update(@Param() { userId }: UserParams, @Body() body: UpdateUserRequest) {
    return this.users.update(userId, body);
  }

  @Post(':userId/disable')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(UserResponse)
  disable(@Param() { userId }: UserParams) {
    return this.users.disable(userId);
  }

  @Post(':userId/enable')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(UserResponse)
  enable(@Param() { userId }: UserParams) {
    return this.users.enable(userId);
  }
}

@Controller('users/:userId/password')
export class PasswordsController {
  constructor(private readonly passwords: PasswordsService) {}

  @Post()
  @ZodSerializerDto(UserProviderResponse)
  setUp(
    @Param() { userId }: UserParams,
    @Body() body: PasswordIdentityRequest,
  ) {
    return this.passwords.setUp(userId, body);
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  change(@Param() { userId }: UserParams, @Body() body: ChangePasswordRequest) {
    return this.passwords.change(userId, body);
  }
}

@Controller('users/:userId/providers')
export class UserProvidersController {
  constructor(private readonly providers: UserProvidersService) {}

  @Post()
  @ZodSerializerDto(UserProviderResponse)
  link(@Param() { userId }: UserParams, @Body() body: LinkUserProviderRequest) {
    return this.providers.link(userId, body);
  }

  @Get()
  @ZodSerializerDto(UserProviderPage)
  list(
    @Param() { userId }: UserParams,
    @Query() query: ListUserProvidersQuery,
  ) {
    return this.providers.list(userId, query);
  }

  @Delete(':userProviderId')
  @HttpCode(HttpStatus.NO_CONTENT)
  unlink(@Param() { userId, userProviderId }: UserProviderParams) {
    return this.providers.unlink(userId, userProviderId);
  }
}
