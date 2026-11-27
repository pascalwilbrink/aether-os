// This file is generated from seshat.asyncapi.yaml by aether-asyncapi-types
// (@aether-os/contracts). Do not edit it by hand; run `pnpm generate:api`.

/**
 * Payload of `knowledge-indexing.completed`.
 */
export interface KnowledgeIndexingCompleted {
  resourceId: string;
  versionId: string;
  versionNumber: number;
  itemId: string;
  /**
   * The item's content version.
   */
  itemVersion: number;
  /**
   * Its passages.
   */
  chunkCount: number;
}

/**
 * Payload of `knowledge-indexing.failed`.
 */
export interface KnowledgeIndexingFailed {
  resourceId: string;
  versionId: string;
  versionNumber: number;
  /**
   * Why
   */
  error: string;
}

/**
 * Payload of `knowledge-item.accepted`.
 */
export interface KnowledgeItemAccepted {
  itemId: string;
  /**
   * The project the item belongs to; null for a department's or the organization's item.
   */
  projectId: string | null;
  /**
   * The department the item belongs to; null for a project's or the organization's item.
   */
  departmentId: string | null;
  type:
    'document' | 'decision' | 'fact' | 'convention' | 'architecture' | 'lesson';
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded' | 'retired';
  /**
   * The item's content version (its text, or a document's file).
   */
  version: number;
  sourceKind: 'person' | 'task' | 'session' | 'repository' | 'episteme';
  supersededBy: string | null;
}

/**
 * Payload of `knowledge-item.indexed`.
 */
export interface KnowledgeItemIndexed {
  itemId: string;
  /**
   * The project the item belongs to; null for a department's or the organization's item.
   */
  projectId: string | null;
  /**
   * The department the item belongs to; null for a project's or the organization's item.
   */
  departmentId: string | null;
  /**
   * The content version whose chunks are ready.
   */
  version: number;
  chunkCount: number;
}

/**
 * Payload of `knowledge-item.proposed`.
 */
export interface KnowledgeItemProposed {
  itemId: string;
  /**
   * The project the item belongs to; null for a department's or the organization's item.
   */
  projectId: string | null;
  /**
   * The department the item belongs to; null for a project's or the organization's item.
   */
  departmentId: string | null;
  type:
    'document' | 'decision' | 'fact' | 'convention' | 'architecture' | 'lesson';
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded' | 'retired';
  /**
   * The item's content version (its text, or a document's file).
   */
  version: number;
  sourceKind: 'person' | 'task' | 'session' | 'repository' | 'episteme';
  supersededBy: string | null;
}

/**
 * Payload of `knowledge-item.rejected`.
 */
export interface KnowledgeItemRejected {
  itemId: string;
  /**
   * The project the item belongs to; null for a department's or the organization's item.
   */
  projectId: string | null;
  /**
   * The department the item belongs to; null for a project's or the organization's item.
   */
  departmentId: string | null;
  type:
    'document' | 'decision' | 'fact' | 'convention' | 'architecture' | 'lesson';
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded' | 'retired';
  /**
   * The item's content version (its text, or a document's file).
   */
  version: number;
  sourceKind: 'person' | 'task' | 'session' | 'repository' | 'episteme';
  supersededBy: string | null;
}

/**
 * Payload of `knowledge-item.retired`.
 */
export interface KnowledgeItemRetired {
  itemId: string;
  /**
   * The project the item belongs to; null for a department's or the organization's item.
   */
  projectId: string | null;
  /**
   * The department the item belongs to; null for a project's or the organization's item.
   */
  departmentId: string | null;
  type:
    'document' | 'decision' | 'fact' | 'convention' | 'architecture' | 'lesson';
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded' | 'retired';
  /**
   * The item's content version (its text, or a document's file).
   */
  version: number;
  sourceKind: 'person' | 'task' | 'session' | 'repository' | 'episteme';
  supersededBy: string | null;
}

/**
 * Payload of `knowledge-item.superseded`.
 */
export interface KnowledgeItemSuperseded {
  itemId: string;
  /**
   * The project the item belongs to; null for a department's or the organization's item.
   */
  projectId: string | null;
  /**
   * The department the item belongs to; null for a project's or the organization's item.
   */
  departmentId: string | null;
  type:
    'document' | 'decision' | 'fact' | 'convention' | 'architecture' | 'lesson';
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded' | 'retired';
  /**
   * The item's content version (its text, or a document's file).
   */
  version: number;
  sourceKind: 'person' | 'task' | 'session' | 'repository' | 'episteme';
  supersededBy: string | null;
}

/**
 * Payload of `knowledge-item.updated`.
 */
export interface KnowledgeItemUpdated {
  itemId: string;
  /**
   * The project the item belongs to; null for a department's or the organization's item.
   */
  projectId: string | null;
  /**
   * The department the item belongs to; null for a project's or the organization's item.
   */
  departmentId: string | null;
  type:
    'document' | 'decision' | 'fact' | 'convention' | 'architecture' | 'lesson';
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded' | 'retired';
  /**
   * The item's content version (its text, or a document's file).
   */
  version: number;
  sourceKind: 'person' | 'task' | 'session' | 'repository' | 'episteme';
  supersededBy: string | null;
}

/** Every Seshat event type, mapped to its payload. */
export interface SeshatEventPayloads {
  'knowledge-indexing.completed': KnowledgeIndexingCompleted;
  'knowledge-indexing.failed': KnowledgeIndexingFailed;
  'knowledge-item.accepted': KnowledgeItemAccepted;
  'knowledge-item.indexed': KnowledgeItemIndexed;
  'knowledge-item.proposed': KnowledgeItemProposed;
  'knowledge-item.rejected': KnowledgeItemRejected;
  'knowledge-item.retired': KnowledgeItemRetired;
  'knowledge-item.superseded': KnowledgeItemSuperseded;
  'knowledge-item.updated': KnowledgeItemUpdated;
}

export type SeshatEventType = keyof SeshatEventPayloads;

/** Every Seshat event type in the spec. */
export const SESHAT_EVENT_TYPES = [
  'knowledge-indexing.completed',
  'knowledge-indexing.failed',
  'knowledge-item.accepted',
  'knowledge-item.indexed',
  'knowledge-item.proposed',
  'knowledge-item.rejected',
  'knowledge-item.retired',
  'knowledge-item.superseded',
  'knowledge-item.updated',
] as const satisfies readonly SeshatEventType[];
