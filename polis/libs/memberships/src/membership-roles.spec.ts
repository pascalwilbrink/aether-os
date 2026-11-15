import { normalizeRoles } from './membership-roles.js';

describe('normalizeRoles', () => {
  it('keeps each role once, highest first', () => {
    expect(normalizeRoles(['viewer', 'owner', 'viewer', 'member'])).toEqual([
      'owner',
      'member',
      'viewer',
    ]);
    expect(normalizeRoles(['admin'])).toEqual(['admin']);
  });
});
