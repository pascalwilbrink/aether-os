import {
  isEditable,
  nextKnowledgeItemStatus,
  type KnowledgeItemAction,
  type KnowledgeItemStatus,
} from './knowledge-transitions.js';

const statuses: KnowledgeItemStatus[] = [
  'proposed',
  'accepted',
  'rejected',
  'superseded',
  'retired',
];
const actions: KnowledgeItemAction[] = [
  'accept',
  'reject',
  'supersede',
  'retire',
];

const allowed: Record<string, KnowledgeItemStatus> = {
  'proposed:accept': 'accepted',
  'proposed:reject': 'rejected',
  'accepted:supersede': 'superseded',
  'accepted:retire': 'retired',
};

describe('knowledge item transitions', () => {
  it.each(
    statuses.flatMap((status) => actions.map((action) => [status, action])),
  )('%s + %s', (status, action) => {
    expect(
      nextKnowledgeItemStatus(
        status as KnowledgeItemStatus,
        action as KnowledgeItemAction,
      ),
    ).toBe(allowed[`${status}:${action}`] ?? null);
  });

  it('edits only proposed and accepted items', () => {
    expect(statuses.filter(isEditable)).toEqual(['proposed', 'accepted']);
  });
});
