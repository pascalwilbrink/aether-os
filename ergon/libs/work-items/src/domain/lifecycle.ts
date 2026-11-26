import type { ApiTypes } from '@ergon/core';

export type WorkItemStatus = ApiTypes.WorkItemStatus;
export type WorkItemAction = ApiTypes.WorkItemAction;

/**
 * The work item lifecycle (ergon/CLAUDE.md, Work lifecycle): for each
 * action, the statuses it leaves from and where it goes. Anything not listed
 * is refused.
 */
export const TRANSITIONS: Readonly<
  Record<WorkItemAction, Partial<Record<WorkItemStatus, WorkItemStatus>>>
> = {
  plan: { backlog: 'todo' },
  defer: { todo: 'backlog' },
  start: { todo: 'in_progress' },
  stop: { in_progress: 'todo' },
  submit: { in_progress: 'in_review' },
  request_changes: { in_review: 'in_progress' },
  approve: { in_review: 'done' },
  complete: { in_progress: 'done' },
  cancel: {
    backlog: 'cancelled',
    todo: 'cancelled',
    in_progress: 'cancelled',
    in_review: 'cancelled',
  },
  reopen: { done: 'in_progress', cancelled: 'todo' },
};

/** Done or cancelled: finished, one way or the other. */
export function isClosed(status: WorkItemStatus): boolean {
  return status === 'done' || status === 'cancelled';
}

export type TransitionDecision =
  | { to: WorkItemStatus }
  | { refused: 'INVALID_TRANSITION' | 'REVIEW_REQUIRED' | 'CHILDREN_OPEN' };

/**
 * Where an action takes a work item, or why it can't. A work item that
 * needs review reaches `done` only through `in_review` (`approve`, never
 * `complete`), and none reaches it while a child is still open.
 */
export function decideTransition(
  item: { status: WorkItemStatus; needsReview: boolean },
  action: WorkItemAction,
  hasOpenChildren: () => boolean,
): TransitionDecision {
  const to = TRANSITIONS[action][item.status];
  if (!to) {
    return { refused: 'INVALID_TRANSITION' };
  }
  if (action === 'complete' && item.needsReview) {
    return { refused: 'REVIEW_REQUIRED' };
  }
  if (to === 'done' && hasOpenChildren()) {
    return { refused: 'CHILDREN_OPEN' };
  }
  return { to };
}
