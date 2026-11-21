import {
  KnowledgeBase,
  KnowledgeError,
  type KnowledgeItem,
  type KnowledgePassages,
  type KnowledgeProposal,
  type KnowledgeScope,
  type KnowledgeSearch,
  type KnowledgeSearchResults,
} from '@hephaestus/runner';

/** A knowledge item as Seshat would return it. */
export function knowledgeItem(
  overrides: Partial<KnowledgeItem> & Pick<KnowledgeItem, 'id' | 'title'>,
): KnowledgeItem {
  const now = new Date().toISOString();
  return {
    organizationId: '00000000-0000-7000-8000-000000000001',
    projectId: '00000000-0000-7000-8000-000000000002',
    type: 'decision',
    body: '',
    status: 'accepted',
    version: 1,
    tags: [],
    references: [],
    source: { kind: 'person', taskId: null },
    supersedes: null,
    supersededBy: null,
    reviewBy: null,
    document: null,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    acceptedBy: 'user-1',
    acceptedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as KnowledgeItem;
}

/**
 * Seshat as each test sets it up: off unless `available`; items by ID,
 * search results, passages; records every call with its scope (the task's
 * token) and keeps proposals.
 */
export class FakeKnowledgeBase extends KnowledgeBase {
  available = false;
  readonly items = new Map<string, KnowledgeItem>();
  results: KnowledgeSearchResults = { results: [], semantic: true };
  passagesOf = new Map<string, KnowledgePassages['items']>();
  readonly calls: { method: string; scope: KnowledgeScope; input: unknown }[] =
    [];
  readonly proposals: KnowledgeProposal[] = [];

  search(
    scope: KnowledgeScope,
    request: KnowledgeSearch,
  ): Promise<KnowledgeSearchResults> {
    this.calls.push({ method: 'search', scope, input: request });
    return Promise.resolve(this.results);
  }

  get(scope: KnowledgeScope, itemId: string): Promise<KnowledgeItem> {
    this.calls.push({ method: 'get', scope, input: itemId });
    const item = this.items.get(itemId);
    return item
      ? Promise.resolve(item)
      : Promise.reject(new KnowledgeError('Seshat answered 404'));
  }

  passages(
    scope: KnowledgeScope,
    itemId: string,
    page: { cursor?: string; limit: number },
  ): Promise<KnowledgePassages> {
    this.calls.push({ method: 'passages', scope, input: { itemId, ...page } });
    const all = this.passagesOf.get(itemId) ?? [];
    const from = page.cursor ? Number(page.cursor) : 0;
    const next = from + page.limit;
    return Promise.resolve({
      items: all.slice(from, next),
      nextCursor: next < all.length ? String(next) : null,
    });
  }

  propose(
    scope: KnowledgeScope,
    proposal: KnowledgeProposal,
  ): Promise<KnowledgeItem> {
    this.calls.push({ method: 'propose', scope, input: proposal });
    this.proposals.push(proposal);
    return Promise.resolve(
      knowledgeItem({
        id: `00000000-0000-7000-8000-00000000010${this.proposals.length}`,
        title: proposal.title,
        type: proposal.type,
        status: 'proposed',
        source: { kind: 'task', taskId: null },
      }),
    );
  }
}
