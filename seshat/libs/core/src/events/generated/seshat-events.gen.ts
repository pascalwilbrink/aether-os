// This file is generated from seshat.asyncapi.yaml by aether-asyncapi-types
// (@aether-os/contracts). Do not edit it by hand; run `pnpm generate:api`.

/**
 * Payload of `knowledge-item.accepted`.
 */
export interface KnowledgeItemAccepted {
  itemId: string;
  projectId: string;
  type:
    'document' | 'decision' | 'fact' | 'convention' | 'architecture' | 'lesson';
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded' | 'retired';
  /**
   * The item's content version (its text, or a document's file).
   */
  version: number;
  sourceKind: 'person' | 'task';
  supersededBy: string | null;
}

/**
 * Payload of `knowledge-item.indexed`.
 */
export interface KnowledgeItemIndexed {
  itemId: string;
  projectId: string;
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
  projectId: string;
  type:
    'document' | 'decision' | 'fact' | 'convention' | 'architecture' | 'lesson';
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded' | 'retired';
  /**
   * The item's content version (its text, or a document's file).
   */
  version: number;
  sourceKind: 'person' | 'task';
  supersededBy: string | null;
}

/**
 * Payload of `knowledge-item.rejected`.
 */
export interface KnowledgeItemRejected {
  itemId: string;
  projectId: string;
  type:
    'document' | 'decision' | 'fact' | 'convention' | 'architecture' | 'lesson';
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded' | 'retired';
  /**
   * The item's content version (its text, or a document's file).
   */
  version: number;
  sourceKind: 'person' | 'task';
  supersededBy: string | null;
}

/**
 * Payload of `knowledge-item.retired`.
 */
export interface KnowledgeItemRetired {
  itemId: string;
  projectId: string;
  type:
    'document' | 'decision' | 'fact' | 'convention' | 'architecture' | 'lesson';
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded' | 'retired';
  /**
   * The item's content version (its text, or a document's file).
   */
  version: number;
  sourceKind: 'person' | 'task';
  supersededBy: string | null;
}

/**
 * Payload of `knowledge-item.superseded`.
 */
export interface KnowledgeItemSuperseded {
  itemId: string;
  projectId: string;
  type:
    'document' | 'decision' | 'fact' | 'convention' | 'architecture' | 'lesson';
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded' | 'retired';
  /**
   * The item's content version (its text, or a document's file).
   */
  version: number;
  sourceKind: 'person' | 'task';
  supersededBy: string | null;
}

/**
 * Payload of `knowledge-item.updated`.
 */
export interface KnowledgeItemUpdated {
  itemId: string;
  projectId: string;
  type:
    'document' | 'decision' | 'fact' | 'convention' | 'architecture' | 'lesson';
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded' | 'retired';
  /**
   * The item's content version (its text, or a document's file).
   */
  version: number;
  sourceKind: 'person' | 'task';
  supersededBy: string | null;
}

/** Every Seshat event type, mapped to its payload. */
export interface SeshatEventPayloads {
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
  'knowledge-item.accepted',
  'knowledge-item.indexed',
  'knowledge-item.proposed',
  'knowledge-item.rejected',
  'knowledge-item.retired',
  'knowledge-item.superseded',
  'knowledge-item.updated',
] as const satisfies readonly SeshatEventType[];
