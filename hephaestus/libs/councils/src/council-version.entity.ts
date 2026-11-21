import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { CouncilVersion } from './council-version.js';

/** A council version as Agora published it (it never changes). */
@Entity({ name: 'council_versions' })
@Check('ck_council_versions_status', `status IN ('published', 'deprecated')`)
@Index('ix_council_versions_council_id', ['councilId'])
export class CouncilVersionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  councilId: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  /** Its number in the council. */
  @Column({ type: 'integer' })
  number: number;

  @Column({ type: 'text' })
  status: 'published' | 'deprecated';

  /** The whole version, from `council-version.published`. */
  @Column({ type: 'jsonb' })
  content: CouncilVersion;

  @Column({ type: 'timestamptz' })
  publishedAt: Date;
}
