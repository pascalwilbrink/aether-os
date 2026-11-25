import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

/**
 * A person of an organization, in any of its departments
 * (`PersonDepartmentEntity`), linked to the Pistis user with the same email
 * address. It grants nothing: roles stay on memberships.
 */
@Entity({ name: 'persons' })
@Unique('uq_persons_organization_id_email', ['organizationId', 'email'])
@Unique('uq_persons_organization_id_user_id', ['organizationId', 'userId'])
// Keyset pagination within an organization: newest first, tie-broken by ID.
@Index('ix_persons_organization_id_created_at_id', [
  'organizationId',
  'createdAt',
  'id',
])
// Persons waiting for a user with their email address.
@Index('ix_persons_email', ['email'])
export class PersonEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'text' })
  name: string;

  /** Lowercase; unique in the organization. */
  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'text' })
  description: string;

  /** Their job title. */
  @Column({ type: 'text', nullable: true })
  role: string | null;

  @Column({ type: 'text', nullable: true })
  gender: string | null;

  /** The Pistis user with the same email address, once linked. */
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;

  /** Incremented on every change; the `aggregateVersion` of its events. */
  @Column({ type: 'integer', default: 1 })
  version: number;
}
