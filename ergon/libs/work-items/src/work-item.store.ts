import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, In, type Repository } from 'typeorm';

import { findPage, type Page, type PageRequest } from '@ergon/core';

import { WorkItemEntity } from './entities/index.js';

/**
 * Work items in the database, for the services of this module: loading
 * (and locking) one in an organization, saving, paging. Permissions are the
 * callers' (`WorkAccess`).
 */
@Injectable()
export class WorkItemStore {
  constructor(
    @InjectRepository(WorkItemEntity)
    private readonly items: Repository<WorkItemEntity>,
  ) {}

  /** 404 unless it's in the organization; `lock` takes it `FOR UPDATE`. */
  async get(
    organizationId: string,
    workItemId: string,
    lock = false,
  ): Promise<WorkItemEntity> {
    const entity = await this.items.findOne({
      where: { id: workItemId, organizationId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(`Work item ${workItemId} not found`);
    }
    return entity;
  }

  /** Both, locked in ID order (so two callers never wait on each other). */
  async getPair(
    organizationId: string,
    a: string,
    b: string,
  ): Promise<[WorkItemEntity, WorkItemEntity]> {
    const [first, second] = a < b ? [a, b] : [b, a];
    const locked = new Map([
      [first, await this.get(organizationId, first, true)],
      [second, await this.get(organizationId, second, true)],
    ]);
    return [locked.get(a)!, locked.get(b)!];
  }

  async insert(entity: WorkItemEntity): Promise<void> {
    await this.items.insert(entity);
  }

  async save(entity: WorkItemEntity): Promise<void> {
    await this.items.save(entity);
  }

  page(
    where: {
      organizationId: string;
      scopeId: string;
      status?: WorkItemEntity['status'];
      parentId?: string;
    },
    page: PageRequest,
  ): Promise<Page<WorkItemEntity>> {
    return findPage(
      this.items,
      {
        where: Object.fromEntries(
          Object.entries(where).filter(([, value]) => value !== undefined),
        ),
        sortBy: 'createdAt',
        direction: 'DESC',
      },
      page,
    );
  }

  /** Whether a child is neither done nor cancelled. */
  async hasOpenChildren(workItemId: string): Promise<boolean> {
    return this.items.exists({
      where: { parentId: workItemId, status: Not(In(['done', 'cancelled'])) },
    });
  }
}
