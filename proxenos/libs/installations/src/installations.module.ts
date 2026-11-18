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
  WebhooksController,
} from './installations.controller.js';
import { InstallationsService } from './installations.service.js';
import { RepositoriesService } from './repositories.service.js';
import { RepositoryEntity } from './repository.entity.js';
import { RepositoryMapper } from './repository.mapper.js';
import { WebhookDeliveryEntity } from './webhook-delivery.entity.js';
import { WebhooksService } from './webhooks.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InstallationEntity,
      RepositoryEntity,
      ConnectRequestEntity,
      WebhookDeliveryEntity,
    ]),
    GitHubModule,
    TenancyModule,
  ],
  controllers: [InstallationsController, GitHubController, WebhooksController],
  providers: [
    InstallationsService,
    InstallationMapper,
    RepositoriesService,
    RepositoryMapper,
    ConnectService,
    WebhooksService,
  ],
  exports: [
    InstallationsService,
    RepositoriesService,
    GitHubModule,
    TenancyModule,
  ],
})
export class InstallationsModule {}
