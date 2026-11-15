import {
  Equal,
  LessThan,
  MoreThan,
  type FindOptionsOrder,
  type FindOptionsWhere,
  type ObjectLiteral,
  type Repository,
} from 'typeorm';

import {
  cursorBinding,
  decodeCursor,
  encodeCursor,
  type CursorKey,
} from '../pagination/cursor.js';
import type { Page, PageRequest } from '../pagination/page.js';

type Column<E> = keyof E & string;

export interface FindPageOptions<E extends ObjectLiteral> {
  /** Equality filters (tenant columns and the like); every page applies them. */
  where: Partial<Record<Column<E>, string | number | boolean | null>>;
  /** The sort column. Together with `idColumn` it must identify a row. */
  sortBy: Column<E>;
  direction: 'ASC' | 'DESC';
  /** Tie-breaker, sorted in the same direction. Defaults to `id`. */
  idColumn?: Column<E>;
}

/**
 * Keyset pagination: each page continues after the last row of the previous
 * one (`(sortBy, id) < (key, id)` for DESC), so rows created or deleted in the
 * meantime never cause duplicates or skipped rows. Fetches `limit + 1` rows to
 * know whether there is a next page. Throws `InvalidCursorError` for a cursor
 * that is malformed or made for different filters or sort.
 */
export async function findPage<E extends ObjectLiteral>(
  repository: Repository<E>,
  options: FindPageOptions<E>,
  page: PageRequest,
): Promise<Page<E>> {
  const { sortBy, direction } = options;
  const idColumn = options.idColumn ?? ('id' as Column<E>);
  const filters = options.where as FindOptionsWhere<E>;
  const binding = cursorBinding({
    sort: sortBy,
    direction,
    filters: options.where,
  });

  let where: FindOptionsWhere<E> | FindOptionsWhere<E>[] = filters;
  if (page.cursor) {
    const position = decodeCursor(page.cursor, binding);
    const after = direction === 'DESC' ? LessThan : MoreThan;
    where = [
      { ...filters, [sortBy]: after(position.key) },
      {
        ...filters,
        [sortBy]: Equal(position.key),
        [idColumn]: after(position.id),
      },
    ];
  }

  const rows = await repository.find({
    where,
    order: {
      [sortBy]: direction,
      [idColumn]: direction,
    } as FindOptionsOrder<E>,
    take: page.limit + 1,
  });

  const items = rows.slice(0, page.limit);
  const last = items.at(-1);
  const nextCursor =
    rows.length > page.limit && last
      ? encodeCursor(
          { key: last[sortBy] as CursorKey, id: String(last[idColumn]) },
          binding,
        )
      : null;

  return { items, nextCursor };
}
