import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  findPage,
  mapPage,
  type ApiTypes,
  type Page,
  type PageRequest,
} from '@ergon/core';

import {
  WorkActivityEntity,
  type ActivityValue,
  type WorkItemEntity,
} from './entities/index.js';
import { WorkItemMapper } from './work-item.mapper.js';

/**
 * A work item's record (ergon/CLAUDE.md, WorkActivity): written by the other
 * services in the transaction of each change, never changed afterwards.
 */
@Injectable()
export class WorkActivityService {
  constructor(
    @InjectRepository(WorkActivityEntity)
    private readonly activity: Repository<WorkActivityEntity>,
    private readonly mapper: WorkItemMapper,
  ) {}

  async record(
    item: Pick<WorkItemEntity, 'id' | 'organizationId'>,
    kind: ApiTypes.WorkActivityKind,
    actor: ApiTypes.Actor | null,
    details: Record<string, ActivityValue>,
    now = new Date(),
  ): Promise<void> {
    await this.activity.insert(
      this.mapper.toActivityEntity(item, kind, actor, details, now),
    );
  }

  /** Oldest first; the caller checked the work item may be read. */
  async list(
    item: Pick<WorkItemEntity, 'id' | 'organizationId'>,
    page: PageRequest,
  ): Promise<Page<ApiTypes.WorkActivityResponse>> {
    const entities = await findPage(
      this.activity,
      {
        where: { organizationId: item.organizationId, workItemId: item.id },
        sortBy: 'createdAt',
        direction: 'ASC',
      },
      page,
    );
    return mapPage(entities, (entity) =>
      this.mapper.toActivityResponse(entity),
    );
  }
}
