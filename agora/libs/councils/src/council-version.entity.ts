import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import type {
  CouncilDiscussion,
  CouncilMember,
  CouncilSettings,
} from './council-configuration.js';
import type { CouncilVersionStatus } from './council-transitions.js';

/** An immutable version of a council's configuration. */
@Entity({ name: 'council_versions' })
@Unique('uq_council_versions_council_id_version', ['councilId', 'version'])
@Check(
  'ck_council_versions_status',
  `status IN ('draft', 'published', 'deprecated')`,
)
@Check('ck_council_versions_version', 'version >= 1')
// Keyset pagination per council: highest version first.
@Index('ix_council_versions_council_id_version_id', [
  'councilId',
  'version',
  'id',
])
export class CouncilVersionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  councilId: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'text' })
  status: CouncilVersionStatus;

  @Column({ type: 'uuid' })
  facilitatorAgentId: string;

  @Column({ type: 'jsonb' })
  members: CouncilMember[];

  @Column({ type: 'jsonb' })
  settings: CouncilSettings;

  @Column({ type: 'jsonb' })
  discussion: CouncilDiscussion;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
}
