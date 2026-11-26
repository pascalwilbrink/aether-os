import { describe, expect, it } from 'vitest';

import { createsCycle, relatedPair } from './dependency-graph.js';

describe('createsCycle', () => {
  const chain = [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'c', to: 'd' },
  ];

  it('refuses a work item blocking itself', () => {
    expect(createsCycle([], 'a', 'a')).toBe(true);
  });

  it('refuses an edge back along a chain', () => {
    expect(createsCycle(chain, 'b', 'a')).toBe(true);
    expect(createsCycle(chain, 'd', 'a')).toBe(true);
    expect(createsCycle(chain, 'c', 'b')).toBe(true);
  });

  it('allows edges forward, across, and into new work', () => {
    expect(createsCycle(chain, 'a', 'c')).toBe(false);
    expect(createsCycle(chain, 'a', 'd')).toBe(false);
    expect(createsCycle(chain, 'x', 'a')).toBe(false);
    expect(createsCycle(chain, 'd', 'x')).toBe(false);
  });

  it('follows branches and terminates on diamonds', () => {
    const diamond = [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'b', to: 'd' },
      { from: 'c', to: 'd' },
      { from: 'd', to: 'e' },
    ];
    expect(createsCycle(diamond, 'e', 'a')).toBe(true);
    expect(createsCycle(diamond, 'c', 'b')).toBe(false);
    expect(createsCycle(diamond, 'e', 'c')).toBe(true);
  });
});

describe('relatedPair', () => {
  it('orders the two IDs', () => {
    expect(relatedPair('b', 'a')).toEqual(['a', 'b']);
    expect(relatedPair('a', 'b')).toEqual(['a', 'b']);
  });
});
