import 'reflect-metadata';

import { inject } from 'vitest';

import {
  Column,
  DataSource,
  Entity,
  PrimaryColumn,
  type Repository,
} from 'typeorm';

import { InvalidCursorError } from '../pagination/cursor.js';
import { findPage } from './find-page.js';
import { postgresOptions } from './postgres.js';

@Entity({ name: 'items' })
class ItemEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ type: 'varchar' })
  tenantId: string;

  @Column({ type: 'integer' })
  rank: number;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}

describe('findPage', () => {
  let dataSource: DataSource;
  let items: Repository<ItemEntity>;

  beforeEach(async () => {
    // A fresh schema per test, in the run's Postgres container.
    dataSource = new DataSource({
      ...postgresOptions({
        url: inject('databaseUrl'),
        entities: [ItemEntity],
      }),
      synchronize: true,
      dropSchema: true,
    });
    await dataSource.initialize();
    items = dataSource.getRepository(ItemEntity);

    // Two rows share each timestamp, so the ID has to break ties.
    const at = (minute: number) =>
      new Date(Date.UTC(2026, 10, 15, 9, minute, 0, 123));
    await items.save([
      { id: 'a', tenantId: 't1', rank: 1, createdAt: at(1) },
      { id: 'b', tenantId: 't1', rank: 2, createdAt: at(1) },
      { id: 'c', tenantId: 't1', rank: 3, createdAt: at(2) },
      { id: 'd', tenantId: 't1', rank: 4, createdAt: at(2) },
      { id: 'e', tenantId: 't1', rank: 5, createdAt: at(3) },
      { id: 'x', tenantId: 't2', rank: 6, createdAt: at(4) },
    ]);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function collect(
    options: Parameters<typeof findPage<ItemEntity>>[1],
    limit: number,
  ): Promise<string[][]> {
    const pages: string[][] = [];
    let cursor: string | null = null;
    do {
      const page = await findPage(items, options, { limit, cursor });
      pages.push(page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);

    return pages;
  }

  it('walks a date-sorted list newest first, breaking ties by ID', async () => {
    const pages = await collect(
      { where: { tenantId: 't1' }, sortBy: 'createdAt', direction: 'DESC' },
      2,
    );

    expect(pages).toEqual([['e', 'd'], ['c', 'b'], ['a']]);
  });

  it('walks ascending by a numeric column', async () => {
    const pages = await collect(
      { where: { tenantId: 't1' }, sortBy: 'rank', direction: 'ASC' },
      3,
    );

    expect(pages).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ]);
  });

  it('returns no cursor when the last page is exactly full', async () => {
    const page = await findPage(
      items,
      { where: { tenantId: 't1' }, sortBy: 'rank', direction: 'ASC' },
      { limit: 5 },
    );

    expect(page.items).toHaveLength(5);
    expect(page.nextCursor).toBeNull();
  });

  it('skips nothing and repeats nothing when rows are added meanwhile', async () => {
    const options = {
      where: { tenantId: 't1' },
      sortBy: 'createdAt',
      direction: 'DESC',
    } as const;
    const first = await findPage(items, options, { limit: 2 });
    await items.save({
      id: 'f',
      tenantId: 't1',
      rank: 7,
      createdAt: new Date(Date.UTC(2026, 10, 15, 10)),
    });

    const second = await findPage(items, options, {
      limit: 10,
      cursor: first.nextCursor,
    });

    expect(second.items.map((item) => item.id)).toEqual(['c', 'b', 'a']);
  });

  it('rejects a cursor from a query with other filters', async () => {
    const first = await findPage(
      items,
      { where: { tenantId: 't1' }, sortBy: 'rank', direction: 'ASC' },
      { limit: 1 },
    );

    await expect(
      findPage(
        items,
        { where: { tenantId: 't2' }, sortBy: 'rank', direction: 'ASC' },
        { limit: 1, cursor: first.nextCursor },
      ),
    ).rejects.toBeInstanceOf(InvalidCursorError);
  });
});
