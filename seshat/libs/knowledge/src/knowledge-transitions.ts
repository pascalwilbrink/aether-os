/** A knowledge item's lifecycle (../../../../docs/knowledge.md, Lifecycle). */
export type KnowledgeItemStatus =
  'proposed' | 'accepted' | 'rejected' | 'superseded' | 'retired';

export type KnowledgeItemAction = 'accept' | 'reject' | 'supersede' | 'retire';

const TRANSITIONS: Record<
  KnowledgeItemStatus,
  Partial<Record<KnowledgeItemAction, KnowledgeItemStatus>>
> = {
  proposed: { accept: 'accepted', reject: 'rejected' },
  accepted: { supersede: 'superseded', retire: 'retired' },
  rejected: {},
  superseded: {},
  retired: {},
};

/** The status an action leads to, or null when it isn't allowed. */
export function nextKnowledgeItemStatus(
  from: KnowledgeItemStatus,
  action: KnowledgeItemAction,
): KnowledgeItemStatus | null {
  return TRANSITIONS[from][action] ?? null;
}

/** Whether an item in this status can get a new version (be edited). */
export function isEditable(status: KnowledgeItemStatus): boolean {
  return status === 'proposed' || status === 'accepted';
}
