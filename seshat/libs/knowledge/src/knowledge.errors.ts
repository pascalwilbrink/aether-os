import { DomainError } from '@seshat/core';

import type { KnowledgeItemStatus } from './knowledge-transitions.js';

export class KnowledgeItemInvalidTransitionError extends DomainError {
  constructor(
    itemId: string,
    from: KnowledgeItemStatus,
    to: KnowledgeItemStatus | 'edited',
  ) {
    super(
      to === 'edited'
        ? `Knowledge item ${itemId} is ${from}: only proposed and accepted items get new versions.`
        : `Knowledge item ${itemId} can't move from ${from} to ${to}.`,
      'KNOWLEDGE_ITEM_INVALID_TRANSITION',
    );
  }
}

export class KnowledgeItemInvalidError extends DomainError {
  constructor(reason: string) {
    super(reason, 'KNOWLEDGE_ITEM_INVALID');
  }
}

export class KnowledgeDocumentInvalidError extends DomainError {
  constructor(reason: string) {
    super(reason, 'KNOWLEDGE_DOCUMENT_INVALID');
  }
}
