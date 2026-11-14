import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

import type { OrganizationStatus } from '../../../domain/organization.js';

@Entity({ name: 'organizations' })
@Unique('UQ_organizations_slug', ['slug'])
export class OrganizationEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  slug: string;

  @Column({ type: 'varchar' })
  status: OrganizationStatus;

  @Column({ type: 'varchar' })
  createdBy: string;

  @Column({ type: 'datetime' })
  createdAt: Date;

  @Column({ type: 'datetime' })
  updatedAt: Date;
}
