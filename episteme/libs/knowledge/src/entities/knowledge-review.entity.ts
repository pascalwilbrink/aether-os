import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@episteme/core';

import type { Actor } from './knowledge-resource.entity.js';

export interface StoredDecision {
  id: string;
  decision: ApiTypes.KnowledgeDecision;
  comment: string | null;
  personId: string | null;
  decidedBy: Actor;
  decidedAt: string;
}

/**
 * One submission of a version for review (episteme/CLAUDE.md, Review and
 * approval), for the checksum submitted. Any decision closes it, since one
 * approval is enough; its decisions are kept with it.
 */
@Entity({ name: 'knowledge_reviews' })
@Check(
  'ck_knowledge_reviews_state',
  `state IN ('open', 'approved', 'rejected', 'changes_requested', 'withdrawn')`,
)
@Index('uq_knowledge_reviews_version_id_round', ['versionId', 'round'], {
  unique: true,
})
// At most one open review per version.
@Index('uq_knowledge_reviews_open', ['versionId'], {
  unique: true,
  where: `state = 'open'`,
})
export class KnowledgeReviewEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  resourceId: string;

  @Column({ type: 'uuid' })
  versionId: string;

  @Column({ type: 'integer' })
  round: number;

  @Column({ type: 'text' })
  state: ApiTypes.KnowledgeReviewState;

  @Column({ type: 'char', length: 64 })
  checksum: string;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ type: 'jsonb' })
  requestedBy: Actor;

  @Column({ type: 'timestamptz' })
  requestedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ type: 'jsonb' })
  decisions: StoredDecision[];
}
