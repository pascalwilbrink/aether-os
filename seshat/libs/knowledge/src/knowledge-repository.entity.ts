import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type KnowledgeRepositoryStatus = 'pending' | 'synced' | 'failed';

/**
 * A repository linked to a project (Proxenos) whose documents Seshat
 * indexes (../../../../docs/knowledge.md, Repository documents): which
 * paths, and how far reading it got. Its documents are knowledge items
 * with `repository_link_id` set.
 */
@Entity({ name: 'knowledge_repositories' })
@Check(
  'ck_knowledge_repositories_status',
  `status IN ('pending', 'synced', 'failed')`,
)
// Keyset pagination within a project: oldest first, tie-broken by link.
@Index('ix_knowledge_repositories_project_created_at_link', [
  'projectId',
  'createdAt',
  'linkId',
])
// The syncer's queue: repositories waiting to be read.
@Index('ix_knowledge_repositories_sync', ['status', 'nextSyncAt'], {
  where: `status = 'pending'`,
})
export class KnowledgeRepositoryEntity {
  /** The repository link's ID in Proxenos. */
  @PrimaryColumn({ type: 'uuid' })
  linkId: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  /** `owner/name`; null until it was first read. */
  @Column({ type: 'text', nullable: true })
  fullName: string | null;

  /** Folders (ending in `/`) and files to index. */
  @Column({ type: 'jsonb' })
  paths: string[];

  @Column({ type: 'text' })
  status: KnowledgeRepositoryStatus;

  /** The default branch's commit its documents were last read at. */
  @Column({ type: 'text', nullable: true })
  commit: string | null;

  @Column({ type: 'integer', default: 0 })
  documentCount: number;

  @Column({ type: 'integer', default: 0 })
  skippedCount: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  /**
   * Grows with every request to read it (a push, a change of paths): a
   * sync that started before one doesn't mark it synced.
   */
  @Column({ type: 'integer', default: 0 })
  revision: number;

  @Column({ type: 'integer', default: 0 })
  syncAttempts: number;

  /** When the syncer may take it (again): a lease, or a failure's backoff. */
  @Column({ type: 'timestamptz', nullable: true })
  nextSyncAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  syncedAt: Date | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
