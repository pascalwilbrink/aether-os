/**
 * A version's lifecycle (episteme/CLAUDE.md, Lifecycle): pure, so it is
 * tested on its own and every service applies the same table. Who may take
 * an action is checked elsewhere (permissions and stewardship).
 */
export type VersionState =
  'draft' | 'in_review' | 'approved' | 'rejected' | 'published' | 'superseded';

export type VersionAction =
  | 'submit'
  | 'withdraw'
  | 'approve'
  | 'reject'
  | 'request_changes'
  | 'publish'
  | 'supersede';

export const VERSION_STATES: readonly VersionState[] = [
  'draft',
  'in_review',
  'approved',
  'rejected',
  'published',
  'superseded',
];

export const VERSION_ACTIONS: readonly VersionAction[] = [
  'submit',
  'withdraw',
  'approve',
  'reject',
  'request_changes',
  'publish',
  'supersede',
];

const TRANSITIONS: Readonly<
  Record<VersionState, Partial<Record<VersionAction, VersionState>>>
> = {
  draft: { submit: 'in_review' },
  in_review: {
    withdraw: 'draft',
    approve: 'approved',
    reject: 'rejected',
    request_changes: 'draft',
  },
  approved: { publish: 'published', supersede: 'superseded' },
  rejected: {},
  published: { supersede: 'superseded' },
  superseded: {},
};

/** The state after the action, or null when the state doesn't allow it. */
export function nextVersionState(
  state: VersionState,
  action: VersionAction,
): VersionState | null {
  return TRANSITIONS[state][action] ?? null;
}

/** A version in `draft` or `in_review`: at most one per resource. */
export function isOpen(state: VersionState): boolean {
  return state === 'draft' || state === 'in_review';
}
