import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PersonsModule } from '@episteme/persons';
import { TenancyModule } from '@episteme/tenancy';

import {
  KnowledgeAuditEntity,
  KnowledgeResourceEntity,
  KnowledgeReviewEntity,
  KnowledgeVersionEntity,
} from './entities/index.js';
import { KnowledgeAccess } from './knowledge-access.service.js';
import { KnowledgeAudit } from './knowledge-audit.service.js';
import { KnowledgeResourcesController } from './knowledge-resources.controller.js';
import { KnowledgeResourcesService } from './knowledge-resources.service.js';
import { KnowledgeReviewsService } from './knowledge-reviews.service.js';
import { KnowledgeVersionsController } from './knowledge-versions.controller.js';
import { KnowledgeVersionsService } from './knowledge-versions.service.js';
import { KnowledgeMapper } from './knowledge.mapper.js';
import { KnowledgeStore } from './knowledge.store.js';

/** Knowledge resources, their versions, review, publication and audit. */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeResourceEntity,
      KnowledgeVersionEntity,
      KnowledgeReviewEntity,
      KnowledgeAuditEntity,
    ]),
    PersonsModule,
    TenancyModule,
  ],
  controllers: [KnowledgeResourcesController, KnowledgeVersionsController],
  providers: [
    KnowledgeStore,
    KnowledgeAudit,
    KnowledgeAccess,
    KnowledgeMapper,
    KnowledgeResourcesService,
    KnowledgeVersionsService,
    KnowledgeReviewsService,
  ],
})
export class KnowledgeModule {}
