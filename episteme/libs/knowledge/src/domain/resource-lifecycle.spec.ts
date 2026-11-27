import {
  nextResourceStatus,
  RESOURCE_ACTIONS,
  RESOURCE_STATUSES,
  type ResourceStatus,
} from './resource-lifecycle.js';

const ALLOWED: Record<string, ResourceStatus> = {
  'draft:publish': 'active',
  'draft:archive': 'archived',
  'active:publish': 'active',
  'active:archive': 'archived',
  'under_review:publish': 'active',
  'under_review:archive': 'archived',
  'expired:publish': 'active',
  'expired:archive': 'archived',
  'superseded:archive': 'archived',
};

describe('resource lifecycle', () => {
  for (const status of RESOURCE_STATUSES) {
    for (const action of RESOURCE_ACTIONS) {
      const key = `${status}:${action}`;
      it(`${key} → ${ALLOWED[key] ?? 'refused'}`, () => {
        expect(nextResourceStatus(status, action)).toBe(ALLOWED[key] ?? null);
      });
    }
  }
});
