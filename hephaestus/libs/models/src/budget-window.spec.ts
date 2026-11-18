import { reached, windowOf } from './budget-window.js';

describe('budget windows', () => {
  it('counts organizations and projects per calendar month in UTC', () => {
    // Late on the last day of October in America, already November in UTC.
    const at = new Date('2026-11-01T02:00:00-04:00');
    expect(windowOf('organization', at)).toEqual({
      start: new Date('2026-11-01T00:00:00.000Z'),
      key: '2026-11',
    });
    expect(windowOf('project', new Date('2026-12-31T23:59:59Z')).key).toBe(
      '2026-12',
    );
  });

  it('counts a task tree over its life', () => {
    expect(windowOf('task_tree', new Date())).toEqual({
      start: null,
      key: 'lifetime',
    });
  });

  it('compares spent and limits exactly', () => {
    expect(reached(10_000_000n, 10_000_000n)).toBe(true);
    expect(reached(9_999_999n, 10_000_000n)).toBe(false);
    expect(reached(8_000_000n, 10_000_000n, 80)).toBe(true);
    expect(reached(7_999_999n, 10_000_000n, 80)).toBe(false);
  });
});
