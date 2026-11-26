import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  ErgonEvents,
  isUniqueViolation,
  Transactional,
  type ApiTypes,
} from '@ergon/core';

import { createsCycle, relatedPair, type BlocksEdge } from './domain/index.js';
import { WorkDependencyEntity, type WorkItemEntity } from './entities/index.js';
import { WorkAccess } from './work-access.service.js';
import { WorkActivityService } from './work-activity.service.js';
import {
  DependencyCycleError,
  DependencyExistsError,
  DependencyLimitError,
  SelfDependencyError,
} from './work-item.errors.js';
import { WorkItemMapper } from './work-item.mapper.js';
import { WorkItemStore } from './work-item.store.js';

type Response = ApiTypes.WorkDependencyResponse;

/** The most dependencies one work item can have, either side. */
export const DEPENDENCY_LIMIT = 200;

/**
 * Dependencies between work items of one organization (ergon/CLAUDE.md,
 * WorkDependency): `blocks` without cycles, and `relates_to`. Changing one
 * needs `work:write` on both work items. They're what Blocked is derived
 * from (`blockedAmong`).
 */
@Injectable()
export class WorkDependenciesService {
  constructor(
    @InjectRepository(WorkDependencyEntity)
    private readonly dependencies: Repository<WorkDependencyEntity>,
    private readonly items: WorkItemStore,
    private readonly access: WorkAccess,
    private readonly activity: WorkActivityService,
    private readonly events: ErgonEvents,
    private readonly mapper: WorkItemMapper,
  ) {}

  async listFor(
    organizationId: string,
    workItemId: string,
  ): Promise<ApiTypes.WorkDependencyList> {
    const item = await this.items.get(organizationId, workItemId);
    this.access.assertCanOnItem(item, 'read');
    const entities = await this.dependencies.find({
      where: [
        { organizationId, fromWorkItemId: item.id },
        { organizationId, toWorkItemId: item.id },
      ],
      order: { createdAt: 'ASC', id: 'ASC' },
      take: DEPENDENCY_LIMIT,
    });
    return {
      items: entities.map((entity) => this.mapper.toDependencyResponse(entity)),
    };
  }

  @Transactional()
  async create(
    organizationId: string,
    request: ApiTypes.WorkDependencyRequest,
  ): Promise<Response> {
    if (request.fromWorkItemId === request.toWorkItemId) {
      throw new SelfDependencyError();
    }
    const [from, to] = await this.items.getPair(
      organizationId,
      request.fromWorkItemId,
      request.toWorkItemId,
    );
    await this.assertWritable(from, to);
    const [fromWorkItemId, toWorkItemId] =
      request.kind === 'relates_to'
        ? relatedPair(from.id, to.id)
        : [from.id, to.id];
    if (request.kind === 'blocks') {
      // One cycle check at a time per organization, so two edges added at
      // once can't close a cycle between them.
      await this.dependencies.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [`ergon:work-dependencies:${organizationId}`],
      );
      const edges = await this.blocksReachableFrom(organizationId, to.id);
      if (createsCycle(edges, from.id, to.id)) {
        throw new DependencyCycleError();
      }
    }
    for (const item of [from, to]) {
      const count = await this.dependencies.count({
        where: [{ fromWorkItemId: item.id }, { toWorkItemId: item.id }],
      });
      if (count >= DEPENDENCY_LIMIT) {
        throw new DependencyLimitError(item.id, DEPENDENCY_LIMIT);
      }
    }
    const actor = this.access.actor();
    const now = new Date();
    const entity = this.mapper.toDependencyEntity(
      organizationId,
      { kind: request.kind, fromWorkItemId, toWorkItemId },
      actor,
      now,
    );
    try {
      await this.dependencies.insert(entity);
    } catch (error) {
      throw isUniqueViolation(error) ? new DependencyExistsError() : error;
    }
    await this.announce(entity, from, to, 'created', actor, now);
    return this.mapper.toDependencyResponse(entity);
  }

  @Transactional()
  async remove(organizationId: string, dependencyId: string): Promise<void> {
    const entity = await this.dependencies.findOne({
      where: { id: dependencyId, organizationId },
    });
    if (!entity) {
      throw new NotFoundException(`Dependency ${dependencyId} not found`);
    }
    const [from, to] = await this.items.getPair(
      organizationId,
      entity.fromWorkItemId,
      entity.toWorkItemId,
    );
    await this.assertWritable(from, to);
    const { affected } = await this.dependencies.delete({ id: entity.id });
    if (!affected) {
      // Removed by someone else meanwhile.
      throw new NotFoundException(`Dependency ${dependencyId} not found`);
    }
    await this.announce(entity, from, to, 'removed', this.access.actor());
  }

  /** Which of these work items are blocked: a blocker is neither done nor cancelled. */
  async blockedAmong(workItemIds: string[]): Promise<Set<string>> {
    if (workItemIds.length === 0) {
      return new Set();
    }
    const rows: { id: string }[] = await this.dependencies.query(
      `SELECT DISTINCT d.to_work_item_id AS id
         FROM work_dependencies d
         JOIN work_items blocker ON blocker.id = d.from_work_item_id
        WHERE d.kind = 'blocks'
          AND d.to_work_item_id = ANY($1::uuid[])
          AND blocker.status NOT IN ('done', 'cancelled')`,
      [workItemIds],
    );
    return new Set(rows.map((row) => row.id));
  }

  private async assertWritable(
    from: WorkItemEntity,
    to: WorkItemEntity,
  ): Promise<void> {
    this.access.assertCanOnItem(from, 'write');
    this.access.assertCanOnItem(to, 'write');
    await this.access.assertAcceptsWrites(from);
    if (to.projectId !== from.projectId) {
      await this.access.assertAcceptsWrites(to);
    }
  }

  /** Every `blocks` edge that can be reached from the work item. */
  private async blocksReachableFrom(
    organizationId: string,
    workItemId: string,
  ): Promise<BlocksEdge[]> {
    return this.dependencies.query(
      `WITH RECURSIVE reached(id) AS (
         SELECT $2::uuid
         UNION
         SELECT d.to_work_item_id
           FROM work_dependencies d
           JOIN reached r ON d.from_work_item_id = r.id
          WHERE d.kind = 'blocks' AND d.organization_id = $1
       )
       SELECT d.from_work_item_id AS "from", d.to_work_item_id AS "to"
         FROM work_dependencies d
         JOIN reached r ON d.from_work_item_id = r.id
        WHERE d.kind = 'blocks' AND d.organization_id = $1`,
      [organizationId, workItemId],
    );
  }

  private async announce(
    entity: WorkDependencyEntity,
    from: WorkItemEntity,
    to: WorkItemEntity,
    change: 'created' | 'removed',
    actor: ApiTypes.Actor,
    now = new Date(),
  ): Promise<void> {
    const details = {
      dependencyId: entity.id,
      kind: entity.kind,
      fromWorkItemId: entity.fromWorkItemId,
      toWorkItemId: entity.toWorkItemId,
    };
    const kind =
      change === 'created' ? 'dependency_added' : 'dependency_removed';
    await this.activity.record(from, kind, actor, details, now);
    await this.activity.record(to, kind, actor, details, now);
    await this.events.emit({
      eventType:
        change === 'created'
          ? 'work-dependency.created'
          : 'work-dependency.removed',
      aggregateId: entity.id,
      aggregateVersion: change === 'created' ? 1 : 2,
      organizationId: to.organizationId,
      projectId: to.projectId,
      payload: details,
    });
  }
}
