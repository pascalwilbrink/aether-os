import {
  hasOwner,
  normalizeScopes,
  normalizeStewards,
  normalizeTags,
  personsIn,
} from './stewardship.js';

const A = '0193a1b2-c3d4-7e5f-8a9b-00000000000a';
const B = '0193a1b2-c3d4-7e5f-8a9b-00000000000b';

describe('stewardship', () => {
  it('keeps each role and person once, owners first', () => {
    const stewards = normalizeStewards([
      { role: 'approver', personId: B },
      { role: 'owner', personId: A },
      { role: 'approver', personId: B },
      { role: 'reviewer', personId: A },
    ]);
    expect(stewards).toEqual([
      { role: 'owner', personId: A },
      { role: 'reviewer', personId: A },
      { role: 'approver', personId: B },
    ]);
    expect(hasOwner(stewards)).toBe(true);
    expect(hasOwner([{ role: 'maintainer', personId: A }])).toBe(false);
    expect([...personsIn(stewards, ['owner', 'approver'])].sort()).toEqual([
      A,
      B,
    ]);
  });

  it('keeps each scope and tag once', () => {
    expect(
      normalizeScopes([
        { type: 'team', id: B },
        { type: 'department', id: A },
        { type: 'team', id: B },
      ]),
    ).toEqual([
      { type: 'department', id: A },
      { type: 'team', id: B },
    ]);
    expect(normalizeTags(['Security', 'security', 'hr'])).toEqual([
      'security',
      'hr',
    ]);
  });
});
