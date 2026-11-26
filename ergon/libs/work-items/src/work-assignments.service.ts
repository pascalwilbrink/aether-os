import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';

import {
  ErgonEvents,
  findPage,
  isUniqueViolation,
  mapPage,
  Transactional,
  type ApiTypes,
  type Page,
  type PageRequest,
} from '@ergon/core';

import { isClosed } from './domain/index.js';
import { WorkAssignmentEntity, type WorkItemEntity } from './entities/index.js';
import { WorkAccess } from './work-access.service.js';
import { WorkActivityService } from './work-activity.service.js';
import {
  AlreadyAssignedError,
  WorkItemClosedError,
} from './work-item.errors.js';
import { WorkItemMapper } from './work-item.mapper.js';
import { WorkItemStore } from './work-item.store.js';

type Response = ApiTypes.WorkAssignmentResponse;
type Assignee = ReturnType<WorkItemMapper['assignee']>;

/**
 * Who is responsible for work and who takes part (ergon/CLAUDE.md,
 * WorkAssignment): at most one active `responsible` per work item, a new one
 * ending the old; history kept. Every change is recorded and announced
 * (`work-assignment.changed`), which is how an agent gets started: Kairos
 * reacts to it, Ergon never runs anything.
 */
@Injectable()
export class WorkAssignmentsService {
  constructor(
    @InjectRepository(WorkAssignmentEntity)
    private readonly assignments: Repository<WorkAssignmentEntity>,
    private readonly items: WorkItemStore,
    private readonly access: WorkAccess,
    private readonly activity: WorkActivityService,
    private readonly events: ErgonEvents,
    private readonly mapper: WorkItemMapper,
  ) {}

  async list(
    organizationId: string,
    workItemId: string,
    query: PageRequest & { status?: ApiTypes.WorkAssignmentStatus },
  ): Promise<Page<Response>> {
    const item = await this.items.get(organizationId, workItemId);
    this.access.assertCanOnItem(item, 'read');
    const { status, ...page } = query;
    const entities = await findPage(
      this.assignments,
      {
        where: { organizationId, workItemId, ...(status ? { status } : {}) },
        sortBy: 'startedAt',
        direction: 'DESC',
      },
      page,
    );
    return mapPage(entities, (entity) =>
      this.mapper.toAssignmentResponse(entity),
    );
  }

  @Transactional()
  async create(
    organizationId: string,
    workItemId: string,
    request: ApiTypes.WorkAssignmentRequest,
  ): Promise<Response> {
    const item = await this.items.get(organizationId, workItemId, true);
    this.access.assertCanOnItem(item, 'write');
    await this.access.assertAcceptsWrites(item);
    if (isClosed(item.status)) {
      throw new WorkItemClosedError(item.id, item.status);
    }
    const actor = this.access.actor();
    const now = new Date();
    const entity = this.mapper.toAssignmentEntity(item, request, actor, now);
    const held = await this.assignments.exists({
      where: {
        workItemId: item.id,
        assigneeKind: entity.assigneeKind,
        assigneeId: entity.assigneeId,
        role: entity.role,
        status: 'active',
      },
    });
    if (held) {
      throw new AlreadyAssignedError(entity.role);
    }
    if (entity.role === 'responsible') {
      const current = await this.assignments.findOne({
        where: { workItemId: item.id, role: 'responsible', status: 'active' },
      });
      if (current) {
        await this.finish(item, current, actor, 'Reassigned', now);
      }
    }
    try {
      await this.assignments.insert(entity);
    } catch (error) {
      throw isUniqueViolation(error)
        ? new AlreadyAssignedError(entity.role)
        : error;
    }
    await this.announce(item, entity, 'started', actor, now);
    return this.mapper.toAssignmentResponse(entity);
  }

  /** Ending an ended assignment returns it unchanged. */
  @Transactional()
  async end(
    organizationId: string,
    workItemId: string,
    assignmentId: string,
    reason: string | undefined,
  ): Promise<Response> {
    const item = await this.items.get(organizationId, workItemId, true);
    this.access.assertCanOnItem(item, 'write');
    const entity = await this.assignments.findOne({
      where: { id: assignmentId, workItemId: item.id, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!entity) {
      throw new NotFoundException(`Assignment ${assignmentId} not found`);
    }
    if (entity.status === 'active') {
      await this.access.assertAcceptsWrites(item);
      await this.finish(item, entity, this.access.actor(), reason ?? null);
    }
    return this.mapper.toAssignmentResponse(entity);
  }

  /** The active responsible assignee of each of these work items. */
  async responsibleFor(workItemIds: string[]): Promise<Map<string, Assignee>> {
    if (workItemIds.length === 0) {
      return new Map();
    }
    const entities = await this.assignments.find({
      where: {
        workItemId: In(workItemIds),
        role: 'responsible',
        status: 'active',
      },
    });
    return new Map(
      entities.map((entity) => [
        entity.workItemId,
        this.mapper.assignee(entity),
      ]),
    );
  }

  private async finish(
    item: WorkItemEntity,
    entity: WorkAssignmentEntity,
    actor: ApiTypes.Actor,
    reason: string | null,
    now = new Date(),
  ): Promise<void> {
    entity.status = 'ended';
    entity.endedAt = now;
    entity.endedBy = actor;
    entity.endReason = reason;
    entity.version = 2;
    await this.assignments.save(entity);
    await this.announce(item, entity, 'ended', actor, now);
  }

  private async announce(
    item: WorkItemEntity,
    entity: WorkAssignmentEntity,
    change: 'started' | 'ended',
    actor: ApiTypes.Actor,
    now: Date,
  ): Promise<void> {
    const assignee = this.mapper.assignee(entity);
    const reason = change === 'started' ? entity.reason : entity.endReason;
    await this.activity.record(
      item,
      change === 'started' ? 'assignment_started' : 'assignment_ended',
      actor,
      { assignmentId: entity.id, assignee, role: entity.role, reason },
      now,
    );
    await this.events.emit({
      eventType: 'work-assignment.changed',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId: item.organizationId,
      projectId: item.projectId,
      payload: {
        change,
        assignmentId: entity.id,
        workItemId: item.id,
        workItemTitle: item.title,
        assignee,
        role: entity.role,
        reason,
      },
    });
  }
}
