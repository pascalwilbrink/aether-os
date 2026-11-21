import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@seshat/core';

import type { KnowledgeItemStatus } from './knowledge-transitions.js';

export type KnowledgeItemType = ApiTypes.KnowledgeItemType;
export type IndexingStatus = ApiTypes.DocumentIndexing['status'];

/**
 * A knowledge item of a project (../../../../docs/knowledge.md): its
 * current version (the history is in `knowledge_item_versions`), its
 * lifecycle, where it came from, and for a document the file and how far
 * indexing got.
 */
@Entity({ name: 'knowledge_items' })
@Check(
  'ck_knowledge_items_type',
  `type IN ('document', 'decision', 'fact', 'convention', 'architecture', 'lesson')`,
)
@Check(
  'ck_knowledge_items_status',
  `status IN ('proposed', 'accepted', 'rejected', 'superseded', 'retired')`,
)
@Check('ck_knowledge_items_source_kind', `source_kind IN ('person', 'task')`)
@Check(
  'ck_knowledge_items_indexing_status',
  `indexing_status IS NULL OR indexing_status IN ('pending', 'indexed', 'failed', 'unsupported')`,
)
// Keyset pagination within a project: newest first, tie-broken by ID.
@Index('ix_knowledge_items_project_created_at_id', [
  'projectId',
  'createdAt',
  'id',
])
@Check(
  'ck_knowledge_items_embedding_status',
  `embedding_status IS NULL OR embedding_status IN ('pending', 'embedded')`,
)
// The embedder's queue: items whose passages wait for vectors.
@Index('ix_knowledge_items_embedding', ['embeddingStatus', 'nextEmbedAt'], {
  where: `embedding_status = 'pending'`,
})
// The indexer's queue: documents waiting to be read.
@Index('ix_knowledge_items_indexing', ['indexingStatus', 'nextIndexAt'], {
  where: `indexing_status = 'pending'`,
})
export class KnowledgeItemEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'text' })
  type: KnowledgeItemType;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'text' })
  status: KnowledgeItemStatus;

  /** The content version (text, or a document's file); grows with each edit. */
  @Column({ type: 'integer' })
  version: number;

  /** Grows with every change: its events' `aggregateVersion`. */
  @Column({ type: 'integer' })
  revision: number;

  @Column({ type: 'jsonb' })
  tags: string[];

  @Column({ type: 'jsonb' })
  references: ApiTypes.KnowledgeReference[];

  @Column({ type: 'text' })
  sourceKind: 'person' | 'task';

  @Column({ type: 'uuid', nullable: true })
  sourceTaskId: string | null;

  @Column({ type: 'uuid', nullable: true })
  supersedes: string | null;

  @Column({ type: 'uuid', nullable: true })
  supersededBy: string | null;

  @Column({ type: 'date', nullable: true })
  reviewBy: string | null;

  // ---- documents only ----
  @Column({ type: 'uuid', nullable: true })
  fileId: string | null;

  @Column({ type: 'text', nullable: true })
  fileName: string | null;

  @Column({ type: 'text', nullable: true })
  contentType: string | null;

  @Column({
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null) => (value === null ? null : Number(value)),
    },
  })
  sizeBytes: number | null;

  @Column({ type: 'text', nullable: true })
  sha256: string | null;

  @Column({ type: 'text', nullable: true })
  indexingStatus: IndexingStatus | null;

  @Column({ type: 'text', nullable: true })
  indexingError: string | null;

  @Column({ type: 'integer', default: 0 })
  chunkCount: number;

  @Column({ type: 'integer', default: 0 })
  indexingAttempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  nextIndexAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  indexedAt: Date | null;

  // ---- embeddings (vectors of its passages, through Pylon) ----

  /** `pending` once its passages change, `embedded` once they all have vectors; null before it has passages. */
  @Column({ type: 'text', nullable: true })
  embeddingStatus: 'pending' | 'embedded' | null;

  /** The model its vectors came from (`<provider>/<model>`). */
  @Column({ type: 'text', nullable: true })
  embeddingModel: string | null;

  @Column({ type: 'integer', default: 0 })
  embeddingAttempts: number;

  /** When the embedder may take it (again): a lease, or a failure's backoff. */
  @Column({ type: 'timestamptz', nullable: true })
  nextEmbedAt: Date | null;

  /** Why the last try failed. */
  @Column({ type: 'text', nullable: true })
  embeddingError: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  embeddedAt: Date | null;
  // ------------------------

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'text' })
  updatedBy: string;

  @Column({ type: 'text', nullable: true })
  acceptedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
