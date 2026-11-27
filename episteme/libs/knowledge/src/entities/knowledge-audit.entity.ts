import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@episteme/core';

import type { Actor } from './knowledge-resource.entity.js';

/**
 * One governance change (episteme/CLAUDE.md, Governance audit), written in
 * the transaction of the change. Kept when its resource is deleted.
 */
@Entity({ name: 'knowledge_audit' })
@Check(
  'ck_knowledge_audit_action',
  `action IN ('resource_created', 'resource_updated', 'scopes_changed', 'stewards_changed', 'resource_archived', 'resource_deleted', 'version_created', 'version_edited', 'version_submitted', 'version_withdrawn', 'version_approved', 'version_rejected', 'changes_requested', 'version_published', 'version_superseded')`,
)
// A resource's record, oldest first.
@Index('ix_knowledge_audit_resource_occurred_at_id', [
  'resourceId',
  'occurredAt',
  'id',
])
export class KnowledgeAuditEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  resourceId: string;

  @Column({ type: 'uuid', nullable: true })
  versionId: string | null;

  @Column({ type: 'text' })
  action: ApiTypes.KnowledgeAuditAction;

  @Column({ type: 'jsonb', nullable: true })
  actor: Actor | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'jsonb' })
  changes: Record<string, object | string | number | boolean | null>;

  @Column({ type: 'timestamptz' })
  occurredAt: Date;
}
