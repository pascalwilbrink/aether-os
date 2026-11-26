import { describe, expect, it } from 'vitest';

import {
  decideTransition,
  isClosed,
  type WorkItemAction,
  type WorkItemStatus,
} from './lifecycle.js';

const STATUSES: WorkItemStatus[] = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'cancelled',
];
const ACTIONS: WorkItemAction[] = [
  'plan',
  'defer',
  'start',
  'stop',
  'submit',
  'request_changes',
  'approve',
  'complete',
  'cancel',
  'reopen',
];

/** Every allowed (status, action) pair; everything else is refused. */
const EXPECTED: Record<string, WorkItemStatus> = {
  'backlog plan': 'todo',
  'todo defer': 'backlog',
  'todo start': 'in_progress',
  'in_progress stop': 'todo',
  'in_progress submit': 'in_review',
  'in_review request_changes': 'in_progress',
  'in_review approve': 'done',
  'in_progress complete': 'done',
  'backlog cancel': 'cancelled',
  'todo cancel': 'cancelled',
  'in_progress cancel': 'cancelled',
  'in_review cancel': 'cancelled',
  'done reopen': 'in_progress',
  'cancelled reopen': 'todo',
};

describe('decideTransition', () => {
  for (const status of STATUSES) {
    for (const action of ACTIONS) {
      const expected = EXPECTED[`${status} ${action}`];
      it(`${action} from ${status}: ${expected ?? 'refused'}`, () => {
        expect(
          decideTransition({ status, needsReview: false }, action, () => false),
        ).toEqual(
          expected ? { to: expected } : { refused: 'INVALID_TRANSITION' },
        );
      });
    }
  }

  it('keeps work that needs review from being completed without it', () => {
    const item = { status: 'in_progress' as const, needsReview: true };
    expect(decideTransition(item, 'complete', () => false)).toEqual({
      refused: 'REVIEW_REQUIRED',
    });
    expect(decideTransition(item, 'submit', () => false)).toEqual({
      to: 'in_review',
    });
    expect(
      decideTransition(
        { ...item, status: 'in_review' },
        'approve',
        () => false,
      ),
    ).toEqual({ to: 'done' });
  });

  it('keeps a parent from being done while a child is open', () => {
    expect(
      decideTransition(
        { status: 'in_progress', needsReview: false },
        'complete',
        () => true,
      ),
    ).toEqual({ refused: 'CHILDREN_OPEN' });
    expect(
      decideTransition(
        { status: 'in_review', needsReview: true },
        'approve',
        () => true,
      ),
    ).toEqual({ refused: 'CHILDREN_OPEN' });
    // Only reaching done asks about children.
    expect(
      decideTransition(
        { status: 'in_progress', needsReview: false },
        'cancel',
        () => true,
      ),
    ).toEqual({ to: 'cancelled' });
  });

  it('calls done and cancelled closed', () => {
    expect(STATUSES.filter(isClosed)).toEqual(['done', 'cancelled']);
  });
});
