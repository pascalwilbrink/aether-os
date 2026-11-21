import { fuse } from './knowledge-search.service.js';

const match = (itemId: string, text = `${itemId} text`) => ({
  itemId,
  text,
  score: 0,
});

describe('fuse (reciprocal rank fusion)', () => {
  it('ranks an item found both ways above one found either way', () => {
    const ranked = fuse(
      {
        keyword: [match('a'), match('b')],
        semantic: [match('c'), match('b', 'b by meaning')],
      },
      10,
    );
    expect(ranked.map((entry) => [entry.itemId, entry.matchedBy])).toEqual([
      ['b', ['keyword', 'semantic']],
      ['a', ['keyword']],
      ['c', ['semantic']],
    ]);
    // b ranks 2nd both ways: on a tie the keyword passage is shown.
    expect(ranked[0].text).toBe('b text');
    expect(ranked[0].score).toBeCloseTo(2 / 62);
  });

  it('shows the passage from the list where the item ranks higher, and keeps to the limit', () => {
    const ranked = fuse(
      {
        keyword: [match('x'), match('y'), match('z')],
        semantic: [match('z', 'z by meaning')],
      },
      2,
    );
    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toMatchObject({ itemId: 'z', text: 'z by meaning' });
  });
});
