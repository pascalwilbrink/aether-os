import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Hephaestus's copy of an Agora council (from `agora.events`,
 * ../../../../docs/councils.md): enough to start sessions with its
 * published version.
 */
@Entity({ name: 'councils' })
@Check('ck_councils_status', `status IN ('active', 'archived')`)
export class CouncilEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'text' })
  key: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  status: 'active' | 'archived';

  /** The published version, if any. */
  @Column({ type: 'uuid', nullable: true })
  latestVersionId: string | null;

  /** The last Agora event applied (`aggregateVersion`): older ones are ignored. */
  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
