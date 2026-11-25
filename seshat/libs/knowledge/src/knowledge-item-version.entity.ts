import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import type { ApiTypes } from '@seshat/core';

/** One version of an item, as it was: the history (never changed). */
@Entity({ name: 'knowledge_item_versions' })
@Unique('uq_knowledge_item_versions_item_version', ['itemId', 'version'])
// Keyset pagination per item: newest version first.
@Index('ix_knowledge_item_versions_item_version_id', [
  'itemId',
  'version',
  'id',
])
export class KnowledgeItemVersionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  itemId: string;

  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'text', nullable: true })
  rationale: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  alternatives: ApiTypes.DecisionAlternative[];

  @Column({ type: 'jsonb' })
  tags: string[];

  @Column({ type: 'jsonb' })
  references: ApiTypes.KnowledgeReference[];

  /** For a document: the file of this version. */
  @Column({ type: 'jsonb', nullable: true })
  document: {
    fileId: string | null;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    sha256: string | null;
    /** A repository document's file (absent on versions from before them). */
    repository?: ApiTypes.KnowledgeRepositoryFile | null;
  } | null;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
