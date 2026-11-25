import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ServiceTokens, type Env } from '@seshat/core';
import { TenancyModule } from '@seshat/tenancy';

import { DocumentFiles } from './document-files.js';
import { DocumentIndexer } from './document-indexer.js';
import { Embeddings, NoEmbeddings } from './embeddings.js';
import { HttpEmbeddings } from './http-embeddings.js';
import { KnowledgeEmbedder } from './knowledge-embedder.js';
import { KnowledgeEmbeddingEntity } from './knowledge-embedding.entity.js';
import { DocumentsService } from './documents.service.js';
import {
  HttpDocumentFiles,
  LOCULUS_CLIENT_OPTIONS,
  type LoculusClientOptions,
} from './http-document-files.js';
import { KnowledgeChunkEntity } from './knowledge-chunk.entity.js';
import { KnowledgeItemVersionEntity } from './knowledge-item-version.entity.js';
import { KnowledgeItemEntity } from './knowledge-item.entity.js';
import { KnowledgeItemMapper } from './knowledge-item.mapper.js';
import { KnowledgeChunksService } from './knowledge-chunks.service.js';
import { DepartmentKnowledgeController } from './department-knowledge.controller.js';
import { KnowledgeController } from './knowledge.controller.js';
import { KnowledgeItemsService } from './knowledge-items.service.js';
import { KnowledgeSearchService } from './knowledge-search.service.js';
import { KnowledgeVersionsService } from './knowledge-versions.service.js';
import { KnowledgeRepositoriesController } from './knowledge-repositories.controller.js';
import { KnowledgeRepositoriesService } from './knowledge-repositories.service.js';
import { KnowledgeRepositoryEntity } from './knowledge-repository.entity.js';
import { KnowledgeRepositoryMapper } from './knowledge-repository.mapper.js';
import { HttpRepositoryFiles } from './http-repository-files.js';
import { NoRepositoryFiles, RepositoryFiles } from './repository-files.js';
import { RepositorySyncer } from './repository-syncer.js';
import {
  KNOWLEDGE_OPTIONS,
  type KnowledgeOptions,
} from './knowledge.options.js';

/**
 * Project knowledge: items, documents (indexed from Loculus, or from
 * repositories linked to the project through Proxenos), their
 * passages' embeddings (through Pylon) and hybrid search.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeItemEntity,
      KnowledgeItemVersionEntity,
      KnowledgeChunkEntity,
      KnowledgeEmbeddingEntity,
      KnowledgeRepositoryEntity,
    ]),
    TenancyModule,
  ],
  controllers: [
    KnowledgeController,
    DepartmentKnowledgeController,
    KnowledgeRepositoriesController,
  ],
  providers: [
    KnowledgeItemsService,
    KnowledgeItemMapper,
    KnowledgeVersionsService,
    KnowledgeChunksService,
    KnowledgeSearchService,
    DocumentsService,
    DocumentIndexer,
    KnowledgeEmbedder,
    KnowledgeRepositoriesService,
    KnowledgeRepositoryMapper,
    RepositorySyncer,
    {
      provide: KNOWLEDGE_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): KnowledgeOptions => ({
        indexerIntervalMs: config.get('INDEXER_INTERVAL_MS', { infer: true }),
        documentMaxBytes: config.get('DOCUMENT_MAX_BYTES', { infer: true }),
        embedderIntervalMs: config.get('EMBEDDER_INTERVAL_MS', { infer: true }),
        searchMinSimilarity: config.get('SEARCH_MIN_SIMILARITY', {
          infer: true,
        }),
        repositorySyncIntervalMs: config.get('REPOSITORY_SYNC_INTERVAL_MS', {
          infer: true,
        }),
        repositoryDefaultPaths: config.get('REPOSITORY_DEFAULT_PATHS', {
          infer: true,
        }),
        repositoryMaxDocuments: config.get('REPOSITORY_MAX_DOCUMENTS', {
          infer: true,
        }),
      }),
    },
    {
      provide: LOCULUS_CLIENT_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): LoculusClientOptions => ({
        baseUrl: config.get('LOCULUS_URL', { infer: true }),
      }),
    },
    { provide: DocumentFiles, useClass: HttpDocumentFiles },
    {
      // Through Proxenos with PROXENOS_URL; else repositories aren't read.
      provide: RepositoryFiles,
      inject: [ConfigService, ServiceTokens],
      useFactory: (config: ConfigService<Env, true>, tokens: ServiceTokens) => {
        const baseUrl = config.get('PROXENOS_URL', { infer: true });
        return baseUrl
          ? new HttpRepositoryFiles({ baseUrl }, tokens)
          : new NoRepositoryFiles();
      },
    },
    {
      // Through Pylon with PYLON_URL; else nothing is embedded.
      provide: Embeddings,
      inject: [ConfigService, ServiceTokens],
      useFactory: (config: ConfigService<Env, true>, tokens: ServiceTokens) => {
        const baseUrl = config.get('PYLON_URL', { infer: true });
        return baseUrl
          ? new HttpEmbeddings(
              {
                baseUrl,
                model: config.get('EMBEDDING_MODEL', { infer: true }),
              },
              tokens,
            )
          : new NoEmbeddings();
      },
    },
  ],
  exports: [
    KnowledgeItemsService,
    KnowledgeSearchService,
    DocumentIndexer,
    KnowledgeEmbedder,
    KnowledgeRepositoriesService,
    RepositorySyncer,
  ],
})
export class KnowledgeModule {}
