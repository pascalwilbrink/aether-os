import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { VersionState } from '../domain/index.js';
import type { Actor } from './knowledge-resource.entity.js';

/**
 * One version of a resource's content (episteme/CLAUDE.md,
 * KnowledgeVersion): Markdown, edited in place while a `draft`, frozen from
 * submission on, never changed once published.
 */
@Entity({ name: 'knowledge_versions' })
@Check(
  'ck_knowledge_versions_state',
  `state IN ('draft', 'in_review', 'approved', 'rejected', 'published', 'superseded')`,
)
@Index('uq_knowledge_versions_resource_id_number', ['resourceId', 'number'], {
  unique: true,
})
@Check(
  'ck_knowledge_versions_indexing_status',
  `indexing_status IS NULL OR indexing_status IN ('pending', 'indexed', 'failed')`,
)
// At most one version in draft or in review per resource.
@Index('uq_knowledge_versions_open', ['resourceId'], {
  unique: true,
  where: `state IN ('draft', 'in_review')`,
})
export class KnowledgeVersionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  resourceId: string;

  @Column({ type: 'integer' })
  number: number;

  @Column({ type: 'text' })
  state: VersionState;

  /** Canonical Markdown (`\n` line endings), secrets redacted. */
  @Column({ type: 'text' })
  content: string;

  /** SHA-256 of `content`, hex. */
  @Column({ type: 'char', length: 64 })
  checksum: string;

  @Column({ type: 'text', nullable: true })
  changeSummary: string | null;

  @Column({ type: 'uuid', nullable: true })
  basedOnVersionId: string | null;

  @Column({ type: 'jsonb' })
  authoredBy: Actor;

  /** Grows with each edit of the draft; `If-Match` for editing and submitting. */
  @Column({ type: 'integer' })
  revision: number;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  // ---- Seshat's indexing, for a version that was published ----

  /** `pending` from publishing until Seshat answers; null if never published. */
  @Column({ type: 'text', nullable: true })
  indexingStatus: IndexingStatus | null;

  /** The Seshat knowledge item that holds it. */
  @Column({ type: 'uuid', nullable: true })
  indexingItemId: string | null;

  @Column({ type: 'integer', nullable: true })
  indexingChunkCount: number | null;

  @Column({ type: 'text', nullable: true })
  indexingError: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  indexingRequestedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  indexingUpdatedAt: Date | null;
}

export type IndexingStatus = 'pending' | 'indexed' | 'failed';

/** A version's indexing before it's published: none. */
export const NOT_INDEXED = {
  indexingStatus: null,
  indexingItemId: null,
  indexingChunkCount: null,
  indexingError: null,
  indexingRequestedAt: null,
  indexingUpdatedAt: null,
} satisfies Partial<KnowledgeVersionEntity>;
