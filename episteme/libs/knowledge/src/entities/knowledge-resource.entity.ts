import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@episteme/core';

import type { ResourceStatus, Scope, Steward } from '../domain/index.js';

export type Actor = ApiTypes.Actor;

/**
 * A knowledge resource (episteme/CLAUDE.md, KnowledgeResource): the stable
 * identity of a piece of the organization's knowledge. Its scopes and
 * stewards are kept with it (`jsonb`, indexed for the list's filters); its
 * content lives in its versions.
 */
@Entity({ name: 'knowledge_resources' })
@Check(
  'ck_knowledge_resources_status',
  `status IN ('draft', 'active', 'under_review', 'expired', 'superseded', 'archived')`,
)
// A project's or a department's, never both.
@Check(
  'ck_knowledge_resources_owner',
  'project_id IS NULL OR department_id IS NULL',
)
// The organization's resources, most recently updated first.
@Index('ix_knowledge_resources_organization_updated_at_id', [
  'organizationId',
  'updatedAt',
  'id',
])
export class KnowledgeResourceEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  /** The project that owns it, if one does (never changed). */
  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  /** The department that owns it, if one does (never changed). */
  @Column({ type: 'uuid', nullable: true })
  departmentId: string | null;

  @Column({ type: 'text' })
  knowledgeType: ApiTypes.KnowledgeType;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', array: true })
  tags: string[];

  @Column({ type: 'text' })
  status: ResourceStatus;

  /** Departments, teams and projects of Polis; empty for the whole organization. */
  @Index('ix_knowledge_resources_scopes', { synchronize: false })
  @Column({ type: 'jsonb' })
  scopes: Scope[];

  /** Persons of Polis in their roles; at least one owner. */
  @Index('ix_knowledge_resources_stewards', { synchronize: false })
  @Column({ type: 'jsonb' })
  stewards: Steward[];

  @Column({ type: 'uuid', nullable: true })
  publishedVersionId: string | null;

  /** The version in `draft` or `in_review`, if any. */
  @Column({ type: 'uuid', nullable: true })
  openVersionId: string | null;

  @Column({ type: 'integer' })
  latestVersionNumber: number;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @Column({ type: 'jsonb' })
  createdBy: Actor;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;

  /** Grows with every change to the resource or its versions; `If-Match` and events' `aggregateVersion`. */
  @Column({ type: 'integer' })
  version: number;
}
