import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

/** A repository linked to a project: the project is repository-backed (docs/git.md). */
@Entity({ name: 'repository_links' })
@Unique('uq_repository_links_project_id_repository_id', [
  'projectId',
  'repositoryId',
])
// Keyset pagination: a project's links, oldest first.
@Index('ix_repository_links_organization_id_project_id_created_at_id', [
  'organizationId',
  'projectId',
  'createdAt',
  'id',
])
// A repository's links, when the installation loses it.
@Index('ix_repository_links_repository_id', ['repositoryId'])
export class RepositoryLinkEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid' })
  repositoryId: string;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
