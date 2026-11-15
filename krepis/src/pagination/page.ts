/** A page request: page size and the cursor from the previous page, if any. */
export interface PageRequest {
  limit: number;
  cursor?: string | null;
}

/** One page of a cursor-paginated list; `nextCursor` is null on the last page. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function mapPage<T, R>(page: Page<T>, map: (item: T) => R): Page<R> {
  return { items: page.items.map(map), nextCursor: page.nextCursor };
}
