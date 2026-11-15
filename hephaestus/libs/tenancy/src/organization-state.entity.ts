import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Hephaestus's copy of an organization's status in Polis, kept up to date
 * from Polis's events (or fetched from Polis when first needed).
 */
@Entity({ name: 'organization_states' })
@Check('ck_organization_states_status', `status IN ('active', 'suspended')`)
export class OrganizationStateEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'text' })
  status: 'active' | 'suspended';

  /** Polis's version of the organization; older events are ignored. */
  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'timestamptz' })
  syncedAt: Date;
}
