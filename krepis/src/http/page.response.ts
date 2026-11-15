import { mapPage, type Page } from '../pagination/page.js';

/** `{ items, nextCursor }`, as every list endpoint responds. */
export class PageResponse<T> implements Page<T> {
  items: T[];
  nextCursor: string | null;

  static fromPage<D, R>(page: Page<D>, map: (item: D) => R): PageResponse<R> {
    return Object.assign(new PageResponse<R>(), mapPage(page, map));
  }
}
