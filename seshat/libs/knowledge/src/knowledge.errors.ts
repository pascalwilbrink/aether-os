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

/** A repository document changes with a commit, not through Seshat: 409. */
export class KnowledgeItemReadOnlyError extends DomainError {
  constructor(itemId: string, fullName: string | null) {
    super(
      `Knowledge item ${itemId} is a document from ${fullName ?? 'a repository'}: change it with a commit there.`,
      'KNOWLEDGE_ITEM_READ_ONLY',
    );
  }
}

/** Episteme's knowledge changes with a published version there, not through Seshat: 409. */
export class KnowledgeItemFromEpistemeError extends DomainError {
  constructor(itemId: string) {
    super(
      `Knowledge item ${itemId} is the published version of an Episteme resource: publish a new version there.`,
      'KNOWLEDGE_ITEM_READ_ONLY',
    );
  }
}

/** A department's item, seen from one of its projects: changed only on the department (409). */
export class KnowledgeItemOfDepartmentError extends DomainError {
  constructor(itemId: string) {
    super(
      `Knowledge item ${itemId} belongs to the project's department: change it there.`,
      'KNOWLEDGE_ITEM_READ_ONLY',
    );
  }
}
