import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { Public, RequirePermission, ZodSerializerDto } from '@proxenos/core';

import { ConnectService } from './connect.service.js';
import { ConnectGitHubParams } from './dto/connect-github.params.js';
import { GitHubConnectRequest } from './dto/github-connect.request.js';
import { GitHubConnectResponse } from './dto/github-connect.response.js';
import { GitHubSetupQuery } from './dto/github-setup.query.js';
import { InstallationPage } from './dto/installation-page.response.js';
import { InstallationParams } from './dto/installation.params.js';
import { InstallationResponse } from './dto/installation.response.js';
import { InstallationsParams } from './dto/installations.params.js';
import { ListInstallationsQuery } from './dto/list-installations.query.js';
import { ListRepositoriesQuery } from './dto/list-repositories.query.js';
import { RepositoriesParams } from './dto/repositories.params.js';
import { RepositoryPage } from './dto/repository-page.response.js';
import { InstallationsService } from './installations.service.js';
import { RepositoriesService } from './repositories.service.js';

@Controller('organizations/:organizationId')
export class InstallationsController {
  constructor(
    private readonly installations: InstallationsService,
    private readonly repositories: RepositoriesService,
    private readonly connect: ConnectService,
  ) {}

  @Post('github/connect')
  @RequirePermission('org:manage')
  @ZodSerializerDto(GitHubConnectResponse)
  start(
    @Param() { organizationId }: ConnectGitHubParams,
    @Body() body: GitHubConnectRequest,
  ) {
    return this.connect.start(organizationId, body);
  }

  @Get('installations')
  @RequirePermission('org:read')
  @ZodSerializerDto(InstallationPage)
  list(
    @Param() { organizationId }: InstallationsParams,
    @Query() query: ListInstallationsQuery,
  ) {
    return this.installations.list(organizationId, query);
  }

  @Get('installations/:installationId')
  @RequirePermission('org:read')
  @ZodSerializerDto(InstallationResponse)
  findById(@Param() { organizationId, installationId }: InstallationParams) {
    return this.installations.findById(organizationId, installationId);
  }

  @Post('installations/:installationId/sync')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('org:manage')
  @ZodSerializerDto(InstallationResponse)
  sync(@Param() { organizationId, installationId }: InstallationParams) {
    return this.installations.sync(organizationId, installationId);
  }

  @Get('repositories')
  @RequirePermission('org:read')
  @ZodSerializerDto(RepositoryPage)
  repositoriesOf(
    @Param() { organizationId }: RepositoriesParams,
    @Query() { installationId, ...page }: ListRepositoriesQuery,
  ) {
    return this.repositories.list(organizationId, { installationId }, page);
  }
}

/** GitHub's two entry points; neither carries a Pistis token. */
@Controller('github')
export class GitHubController {
  constructor(private readonly connect: ConnectService) {}

  /** The app's setup URL: always a redirect back to Iris. */
  @Get('setup')
  @Public()
  async setup(@Query() query: GitHubSetupQuery, @Res() response: Response) {
    response.redirect(HttpStatus.SEE_OTHER, await this.connect.complete(query));
  }
}
