import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

import type { ProjectStatus } from '../../../domain/project.js';

@Entity({ name: 'projects' })
@Unique('UQ_projects_organization_id_slug', ['organizationId', 'slug'])
export class ProjectEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  slug: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar' })
  status: ProjectStatus;

  @Column({ type: 'varchar' })
  createdBy: string;

  @Column({ type: 'datetime' })
  createdAt: Date;

  @Column({ type: 'datetime' })
  updatedAt: Date;
}
