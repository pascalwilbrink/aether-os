import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InstallationsModule } from '@proxenos/installations';

import { RepositoryLinkEntity } from './repository-link.entity.js';
import { RepositoryLinkMapper } from './repository-link.mapper.js';
import { RepositoryLinksController } from './repository-links.controller.js';
import { RepositoryLinksService } from './repository-links.service.js';
import { RepositoryTokensService } from './repository-tokens.service.js';

/** Repository ↔ project links, and tokens for tasks. */
@Module({
  imports: [
    TypeOrmModule.forFeature([RepositoryLinkEntity]),
    InstallationsModule,
  ],
  controllers: [RepositoryLinksController],
  providers: [
    RepositoryLinksService,
    RepositoryLinkMapper,
    RepositoryTokensService,
  ],
  exports: [RepositoryLinksService],
})
export class RepositoriesModule {}
