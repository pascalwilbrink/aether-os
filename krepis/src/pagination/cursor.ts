import { createHash } from 'node:crypto';

/** Thrown when a cursor is malformed or was made for a different query (400 INVALID_CURSOR). */
export class InvalidCursorError extends Error {
  readonly code = 'INVALID_CURSOR';

  constructor(
    message = 'The cursor is invalid or belongs to a different query.',
  ) {
    super(message);
    this.name = 'InvalidCursorError';
  }
}

/** The sort key value of an item a page ended on. */
export type CursorKey = string | number | Date;

/** Where the next page starts: after the item with this sort key and ID. */
export interface CursorPosition {
  key: CursorKey;
  id: string;
}

const MAX_CURSOR_LENGTH = 1024;

interface CursorPayload {
  v: 1;
  /** Key type: date, string or number. */
  t: 'd' | 's' | 'n';
  k: string | number;
  id: string;
  /** Binding: a hash of the query (sort and filters) the cursor was made for. */
  b: string;
}

/**
 * Identifies a query, so a cursor can only be used with the query it was made
 * for. Filter values must be JSON-serializable; key order doesn't matter.
 */
export function cursorBinding(query: {
  sort: string;
  direction: 'ASC' | 'DESC';
  filters: Record<string, unknown>;
}): string {
  const filters = Object.fromEntries(
    Object.entries(query.filters).sort(([a], [b]) => a.localeCompare(b)),
  );

  return createHash('sha256')
    .update(JSON.stringify([query.sort, query.direction, filters]))
    .digest('base64url')
    .slice(0, 16);
}

/** Encodes a position as an opaque cursor (base64url JSON) bound to a query. */
export function encodeCursor(
  position: CursorPosition,
  binding: string,
): string {
  const { key, id } = position;
  const payload: CursorPayload =
    key instanceof Date
      ? { v: 1, t: 'd', k: key.toISOString(), id, b: binding }
      : typeof key === 'number'
        ? { v: 1, t: 'n', k: key, id, b: binding }
        : { v: 1, t: 's', k: key, id, b: binding };

  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Decodes and checks a cursor. Throws `InvalidCursorError` when it is
 * malformed or was made for another query. A cursor grants no access by
 * itself: the caller's query still applies every tenancy filter.
 */
export function decodeCursor(cursor: string, binding: string): CursorPosition {
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) {
    throw new InvalidCursorError();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError();
  }

  if (!isPayload(payload)) {
    throw new InvalidCursorError();
  }
  if (payload.b !== binding) {
    throw new InvalidCursorError();
  }

  if (payload.t === 'd') {
    const date = new Date(payload.k);
    if (Number.isNaN(date.getTime())) {
      throw new InvalidCursorError();
    }
    return { key: date, id: payload.id };
  }

  return { key: payload.k, id: payload.id };
}

function isPayload(value: unknown): value is CursorPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const p = value as Record<string, unknown>;

  return (
    p.v === 1 &&
    typeof p.id === 'string' &&
    p.id.length > 0 &&
    typeof p.b === 'string' &&
    ((p.t === 'n' && typeof p.k === 'number' && Number.isFinite(p.k)) ||
      ((p.t === 's' || p.t === 'd') && typeof p.k === 'string'))
  );
}
