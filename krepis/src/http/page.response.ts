import { mapPage, type Page } from '../pagination/page.js';

export class PageResponse<T> implements Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;

  static fromPage<D, R>(page: Page<D>, map: (item: D) => R): PageResponse<R> {
    return Object.assign(new PageResponse<R>(), mapPage(page, map));
  }
}
