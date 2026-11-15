import {
  nextOrganizationStatus,
  organizationAcceptsWrites,
  type OrganizationAction,
  type OrganizationStatus,
} from './organization-transitions.js';

describe('organization transitions', () => {
  // Every (status, action) pair: the table is the whole lifecycle.
  it.each<[OrganizationStatus, OrganizationAction, OrganizationStatus]>([
    ['active', 'suspend', 'suspended'],
    ['active', 'activate', 'active'],
    ['suspended', 'suspend', 'suspended'],
    ['suspended', 'activate', 'active'],
  ])('%s --%s--> %s', (current, action, next) => {
    expect(nextOrganizationStatus(current, action)).toBe(next);
  });

  it('accepts writes only while active', () => {
    expect(organizationAcceptsWrites('active')).toBe(true);
    expect(organizationAcceptsWrites('suspended')).toBe(false);
  });
});
