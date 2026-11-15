import type { OrganizationRole } from '@polis/core';

import { capRole, grantableCap, withinCap } from './project-role-cap.js';
import type { ProjectRole } from './project-membership.types.js';

describe('project role cap', () => {
  it.each<['user' | 'service_account', OrganizationRole[], ProjectRole | null]>(
    [
      ['user', ['owner'], 'approver'],
      ['user', ['admin'], 'approver'],
      ['user', ['member'], 'approver'],
      ['user', ['viewer'], 'viewer'],
      ['user', ['viewer', 'member'], 'approver'],
      ['user', [], null],
      ['service_account', ['member'], 'editor'],
      ['service_account', ['admin'], 'editor'],
      ['service_account', ['viewer'], 'viewer'],
    ],
  )('%s with %j can be granted up to %s', (subjectType, roles, cap) => {
    expect(grantableCap(subjectType, roles)).toBe(cap);
  });

  it.each<[ProjectRole, ProjectRole | null, boolean]>([
    ['approver', 'approver', true],
    ['editor', 'approver', true],
    ['viewer', 'approver', true],
    ['approver', 'editor', false],
    ['editor', 'editor', true],
    ['editor', 'viewer', false],
    ['viewer', 'viewer', true],
    ['viewer', null, false],
  ])('%s within %s: %s', (role, cap, expected) => {
    expect(withinCap(role, cap)).toBe(expected);
  });

  it('caps a role to the lower of the two', () => {
    expect(capRole('approver', 'viewer')).toBe('viewer');
    expect(capRole('viewer', 'approver')).toBe('viewer');
    expect(capRole('editor', 'editor')).toBe('editor');
  });
});
