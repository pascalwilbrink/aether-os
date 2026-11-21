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
import { KnowledgeController } from './knowledge.controller.js';
import { KnowledgeItemsService } from './knowledge-items.service.js';
import { KnowledgeSearchService } from './knowledge-search.service.js';
import { KnowledgeVersionsService } from './knowledge-versions.service.js';
import {
  KNOWLEDGE_OPTIONS,
  type KnowledgeOptions,
} from './knowledge.options.js';

/**
 * Project knowledge: items, documents (indexed from Loculus), their
 * passages' embeddings (through Pylon) and hybrid search.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      KnowledgeItemEntity,
      KnowledgeItemVersionEntity,
      KnowledgeChunkEntity,
      KnowledgeEmbeddingEntity,
    ]),
    TenancyModule,
  ],
  controllers: [KnowledgeController],
  providers: [
    KnowledgeItemsService,
    KnowledgeItemMapper,
    KnowledgeVersionsService,
    KnowledgeChunksService,
    KnowledgeSearchService,
    DocumentsService,
    DocumentIndexer,
    KnowledgeEmbedder,
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
  ],
})
export class KnowledgeModule {}
