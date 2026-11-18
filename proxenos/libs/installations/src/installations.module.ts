import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GitHubModule } from '@proxenos/github';
import { TenancyModule } from '@proxenos/tenancy';

import { ConnectRequestEntity } from './connect-request.entity.js';
import { ConnectService } from './connect.service.js';
import { InstallationEntity } from './installation.entity.js';
import { InstallationMapper } from './installation.mapper.js';
import {
  GitHubController,
  InstallationsController,
} from './installations.controller.js';
import { InstallationsService } from './installations.service.js';
import { PullRequestEntity } from './pull-request.entity.js';
import { PullRequestsService } from './pull-requests.service.js';
import { RepositoriesService } from './repositories.service.js';
import { RepositoryEntity } from './repository.entity.js';
import { RepositoryMapper } from './repository.mapper.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstallationEntity,
      RepositoryEntity,
      ConnectRequestEntity,
      PullRequestEntity,
    ]),
    GitHubModule,
    TenancyModule,
  ],
  controllers: [InstallationsController, GitHubController],
  providers: [
    InstallationsService,
    InstallationMapper,
    RepositoriesService,
    RepositoryMapper,
    ConnectService,
    PullRequestsService,
  ],
  exports: [
    InstallationsService,
    RepositoriesService,
    PullRequestsService,
    GitHubModule,
    TenancyModule,
  ],
})
export class InstallationsModule {}
