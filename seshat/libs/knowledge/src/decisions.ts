import { redactText, type ApiTypes } from '@seshat/core';

import type { KnowledgeItemEntity } from './knowledge-item.entity.js';
import { KnowledgeItemInvalidError } from './knowledge.errors.js';

type KnowledgeItemType = KnowledgeItemEntity['type'];

/**
 * A decision's reasons (../../../../docs/councils.md, Decisions): its
 * rationale and the alternatives it considered, which only decisions carry,
 * and the text its passages are made of. Pure, so it can be tested.
 */

/**
 * A decision's rationale and alternatives (redacted like bodies), or none for
 * any other type, which may not carry them (`KNOWLEDGE_ITEM_INVALID`).
 */
export function decisionOf(
  type: KnowledgeItemType,
  fields: {
    rationale?: string | null;
    alternatives?: ApiTypes.DecisionAlternative[];
  },
): Pick<KnowledgeItemEntity, 'rationale' | 'alternatives'> {
  const rationale = fields.rationale?.trim() ? fields.rationale : null;
  const alternatives = fields.alternatives ?? [];
  if (type !== 'decision') {
    if (rationale !== null || alternatives.length > 0) {
      throw new KnowledgeItemInvalidError(
        `Only a decision has a rationale and alternatives, not a ${type}.`,
      );
    }
    return { rationale: null, alternatives: [] };
  }
  return {
    rationale: rationale && redactText(rationale, { keepEmails: true }),
    alternatives: alternatives.map(({ option, reason }) => ({
      option: redactText(option, { keepEmails: true }),
      reason: redactText(reason, { keepEmails: true }),
    })),
  };
}

/** What a written item's passages are made of: its body, then a decision's reasons. */
export function searchableText(
  item: Pick<KnowledgeItemEntity, 'body' | 'rationale' | 'alternatives'>,
): string {
  return [
    item.body,
    ...(item.rationale ? [`## Rationale\n\n${item.rationale}`] : []),
    ...(item.alternatives.length > 0
      ? [
          `## Alternatives\n\n${item.alternatives
            .map(({ option, reason }) => `- ${option}: ${reason}`)
            .join('\n')}`,
        ]
      : []),
  ].join('\n\n');
}
