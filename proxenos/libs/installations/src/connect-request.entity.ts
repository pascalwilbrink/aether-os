import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

/**
 * A started "Connect GitHub": the single-use `state` (only its SHA-256 is
 * kept) that binds GitHub's setup callback to an organization and a person.
 */
@Entity({ name: 'connect_requests' })
@Unique('uq_connect_requests_state_hash', ['stateHash'])
export class ConnectRequestEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'text' })
  requestedBy: string;

  /** A path in Iris to come back to. */
  @Column({ type: 'text' })
  returnTo: string;

  @Column({ type: 'text' })
  stateHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  /** Set once the callback used it; a state works once. */
  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
