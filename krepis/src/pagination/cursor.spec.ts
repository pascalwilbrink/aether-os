import {
  cursorBinding,
  decodeCursor,
  encodeCursor,
  InvalidCursorError,
} from './cursor.js';

const binding = cursorBinding({
  sort: 'createdAt',
  direction: 'DESC',
  filters: { organizationId: 'org-1' },
});

describe('cursor', () => {
  it.each([
    ['date', new Date('2026-11-15T09:30:00.123Z')],
    ['string', 'b-slug'],
    ['number', 42],
  ])('round-trips a %s key', (_, key) => {
    const cursor = encodeCursor({ key, id: 'id-1' }, binding);

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor, binding)).toEqual({ key, id: 'id-1' });
  });

  it('rejects a cursor made for another query', () => {
    const other = cursorBinding({
      sort: 'createdAt',
      direction: 'DESC',
      filters: { organizationId: 'org-2' },
    });
    const cursor = encodeCursor({ key: 1, id: 'id-1' }, other);

    expect(() => decodeCursor(cursor, binding)).toThrow(InvalidCursorError);
  });

  it('binds to sort and direction, not to filter key order', () => {
    const base = { sort: 'createdAt', direction: 'DESC' as const };

    expect(cursorBinding({ ...base, filters: { a: 1, b: 2 } })).toBe(
      cursorBinding({ ...base, filters: { b: 2, a: 1 } }),
    );
    expect(cursorBinding({ ...base, filters: {} })).not.toBe(
      cursorBinding({ ...base, direction: 'ASC', filters: {} }),
    );
    expect(cursorBinding({ ...base, filters: {} })).not.toBe(
      cursorBinding({ ...base, sort: 'name', filters: {} }),
    );
  });

  it.each([
    ['empty', ''],
    ['not base64 JSON', 'not-a-cursor'],
    ['too long', 'a'.repeat(2000)],
    ['JSON array', Buffer.from('[1]').toString('base64url')],
    [
      'wrong version',
      Buffer.from(
        JSON.stringify({ v: 2, t: 'n', k: 1, id: 'x', b: binding }),
      ).toString('base64url'),
    ],
    [
      'key of the wrong type',
      Buffer.from(
        JSON.stringify({ v: 1, t: 'n', k: '1', id: 'x', b: binding }),
      ).toString('base64url'),
    ],
    [
      'invalid date',
      Buffer.from(
        JSON.stringify({ v: 1, t: 'd', k: 'yesterday', id: 'x', b: binding }),
      ).toString('base64url'),
    ],
    [
      'missing id',
      Buffer.from(JSON.stringify({ v: 1, t: 'n', k: 1, b: binding })).toString(
        'base64url',
      ),
    ],
  ])('rejects a cursor that is %s', (_, cursor) => {
    expect(() => decodeCursor(cursor, binding)).toThrow(InvalidCursorError);
  });
});
