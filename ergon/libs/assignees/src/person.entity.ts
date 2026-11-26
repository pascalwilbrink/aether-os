import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * A person of an organization, as Polis announces them (`person.*`): the
 * people work can be assigned to. Polis owns them; this copy holds only
 * what assignments need, and is guarded by Polis's `version`.
 */
@Entity({ name: 'persons' })
@Check('ck_persons_status', `status IN ('active', 'deleted')`)
@Index('ix_persons_organization_id', ['organizationId'])
export class PersonEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  /** The linked Pistis user, if they've signed up. */
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  /** Kept once deleted, so a late `person.updated` can't bring them back. */
  @Column({ type: 'text' })
  status: 'active' | 'deleted';

  /** Polis's version of the person (the events' `aggregateVersion`). */
  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'timestamptz' })
  receivedAt: Date;
}
