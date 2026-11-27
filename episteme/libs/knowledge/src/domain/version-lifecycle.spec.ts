import {
  isOpen,
  nextVersionState,
  VERSION_ACTIONS,
  VERSION_STATES,
  type VersionAction,
  type VersionState,
} from './version-lifecycle.js';

/** Every allowed (state, action) pair; everything else is refused. */
const ALLOWED: Record<string, VersionState> = {
  'draft:submit': 'in_review',
  'in_review:withdraw': 'draft',
  'in_review:approve': 'approved',
  'in_review:reject': 'rejected',
  'in_review:request_changes': 'draft',
  'approved:publish': 'published',
  'approved:supersede': 'superseded',
  'published:supersede': 'superseded',
};

describe('version lifecycle', () => {
  for (const state of VERSION_STATES) {
    for (const action of VERSION_ACTIONS) {
      const key = `${state}:${action}`;
      it(`${key} → ${ALLOWED[key] ?? 'refused'}`, () => {
        expect(nextVersionState(state, action as VersionAction)).toBe(
          ALLOWED[key] ?? null,
        );
      });
    }
  }

  it('counts draft and in_review as open', () => {
    expect(VERSION_STATES.filter(isOpen)).toEqual(['draft', 'in_review']);
  });
});
