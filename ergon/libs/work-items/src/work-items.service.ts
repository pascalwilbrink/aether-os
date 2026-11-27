import { Injectable, PreconditionFailedException } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';

import {
  ErgonEvents,
  Transactional,
  ValidationProblemException,
  type ApiTypes,
  type Page,
  type PageRequest,
} from '@ergon/core';

import { decideTransition, isClosed } from './domain/index.js';
import type { WorkItemEntity } from './entities/index.js';
import { WorkAccess } from './work-access.service.js';
import { WorkActivityService } from './work-activity.service.js';
import { WorkAssignmentsService } from './work-assignments.service.js';
import { WorkDependenciesService } from './work-dependencies.service.js';
import {
  ChildrenOpenError,
  InvalidTransitionError,
  ReviewRequiredError,
  WorkItemClosedError,
} from './work-item.errors.js';
import { CONTENT_FIELDS, WorkItemMapper } from './work-item.mapper.js';
import { WorkItemStore } from './work-item.store.js';

type Response = ApiTypes.WorkItemResponse;

/**
 * Work items (ergon/CLAUDE.md, WorkItem and Work lifecycle): created,
 * changed and moved through the fixed lifecycle by people and agents alike,
 * each change recorded in the activity and announced. Blocked and the
 * responsible assignee are derived for every response.
 */
@Injectable()
export class WorkItemsService {
  constructor(
    private readonly items: WorkItemStore,
    private readonly assignments: WorkAssignmentsService,
    private readonly dependencies: WorkDependenciesService,
    private readonly activity: WorkActivityService,
    private readonly events: ErgonEvents,
    private readonly access: WorkAccess,
    private readonly mapper: WorkItemMapper,
  ) {}

  async list(
    organizationId: string,
    query: PageRequest & {
      projectId?: string;
      status?: ApiTypes.WorkItemStatus;
      parentId?: string;
    },
  ): Promise<Page<Response>> {
    const { projectId, status, parentId, ...page } = query;
    this.access.assertCan(projectId ?? null, 'read');
    const entities = await this.items.page(
      {
        organizationId,
        scopeId: projectId ?? organizationId,
        status,
        parentId,
      },
      page,
    );
    return {
      items: await this.present(entities.items),
      nextCursor: entities.nextCursor,
    };
  }

  async get(organizationId: string, workItemId: string): Promise<Response> {
    const entity = await this.items.get(organizationId, workItemId);
    this.access.assertCanOnItem(entity, 'read');
    return this.presentOne(entity);
  }

  async listActivity(
    organizationId: string,
    workItemId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.WorkActivityResponse>> {
    const entity = await this.items.get(organizationId, workItemId);
    this.access.assertCanOnItem(entity, 'read');
    return this.activity.list(entity, page);
  }

  @Transactional()
  async create(
    organizationId: string,
    request: ApiTypes.WorkItemRequest,
  ): Promise<Response> {
    let projectId = request.projectId ?? null;
    const parentId = request.parentId ?? null;
    if (parentId) {
      const parent = await this.items.get(organizationId, parentId, true);
      this.access.assertCanOnItem(parent, 'read');
      if (request.projectId === undefined) {
        projectId = parent.projectId;
      } else if (projectId !== parent.projectId) {
        throw new ValidationProblemException([
          {
            pointer: '/projectId',
            parameter: null,
            code: 'INVALID',
            detail: "A child is in its parent's project.",
          },
        ]);
      }
      if (isClosed(parent.status)) {
        throw new WorkItemClosedError(parent.id, parent.status);
      }
    }
    this.access.assertCan(projectId, 'write');
    await this.access.assertAcceptsWrites({ organizationId, projectId });
    await this.access.assertOwners(organizationId, {
      departmentId: request.departmentId ?? null,
      teamId: request.teamId ?? null,
    });
    const actor = this.access.actor();
    const now = new Date();
    const entity = this.mapper.toEntity(
      { organizationId, projectId, parentId },
      request,
      {
        kind: request.source?.kind ?? this.access.defaultSource(),
        reference: request.source?.reference ?? null,
      },
      actor,
      now,
    );
    await this.items.insert(entity);
    await this.activity.record(
      entity,
      'created',
      actor,
      { status: entity.status },
      now,
    );
    await this.events.emit({
      eventType: 'work-item.created',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId,
      projectId,
      payload: { workItem: this.mapper.toSnapshot(entity) },
    });
    return this.presentOne(entity);
  }

  /** The full content; changes nothing (and announces nothing) when it's the same. */
  @Transactional()
  async update(
    organizationId: string,
    workItemId: string,
    request: ApiTypes.WorkItemUpdate,
    ifMatch: string | undefined,
  ): Promise<Response> {
    const entity = await this.lockForWrite(organizationId, workItemId, ifMatch);
    if (entity.status === 'cancelled') {
      throw new WorkItemClosedError(entity.id, entity.status);
    }
    const content = this.mapper.content(request);
    const changedFields = CONTENT_FIELDS.filter(
      (field) => !isDeepStrictEqual(entity[field], content[field]),
    );
    if (changedFields.length === 0) {
      return this.presentOne(entity);
    }
    // Only a new department or team is checked: one archived since can stay.
    await this.access.assertOwners(organizationId, {
      departmentId:
        content.departmentId !== entity.departmentId
          ? content.departmentId
          : null,
      teamId: content.teamId !== entity.teamId ? content.teamId : null,
    });
    Object.assign(entity, content);
    const actor = this.access.actor();
    const now = this.touch(entity);
    await this.items.save(entity);
    await this.activity.record(
      entity,
      'updated',
      actor,
      { fields: changedFields },
      now,
    );
    await this.events.emit({
      eventType: 'work-item.updated',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId,
      projectId: entity.projectId,
      payload: { workItem: this.mapper.toSnapshot(entity), changedFields },
    });
    return this.presentOne(entity);
  }

  @Transactional()
  async transition(
    organizationId: string,
    workItemId: string,
    request: ApiTypes.WorkItemTransitionRequest,
    ifMatch: string | undefined,
  ): Promise<Response> {
    const entity = await this.lockForWrite(organizationId, workItemId, ifMatch);
    let openChildren = false;
    if (request.action === 'complete' || request.action === 'approve') {
      openChildren = await this.items.hasOpenChildren(entity.id);
    }
    const decision = decideTransition(
      entity,
      request.action,
      () => openChildren,
    );
    if ('refused' in decision) {
      throw decision.refused === 'REVIEW_REQUIRED'
        ? new ReviewRequiredError(entity.id)
        : decision.refused === 'CHILDREN_OPEN'
          ? new ChildrenOpenError(entity.id)
          : new InvalidTransitionError(entity.status, request.action);
    }
    await this.apply(
      entity,
      request.action,
      decision.to,
      request.reason ?? null,
      this.access.actor(),
    );
    return this.presentOne(entity);
  }

  /**
   * Ergon's own transitions (no actor, no caller to check): the actions in
   * turn, each only if the lifecycle allows it from where the work item is
   * then; any it doesn't are skipped, never an error. For the work's agent
   * starting and finishing (`WorkExecutionsService`).
   */
  async advance(
    organizationId: string,
    workItemId: string,
    actions: ApiTypes.WorkItemAction[],
    reason: string,
  ): Promise<void> {
    const entity = await this.items.get(organizationId, workItemId, true);
    for (const action of actions) {
      const decision = decideTransition(entity, action, () => false);
      if ('to' in decision) {
        await this.apply(entity, action, decision.to, reason, null);
      }
    }
  }

  /** Moves the work item, records it and announces it. */
  private async apply(
    entity: WorkItemEntity,
    action: ApiTypes.WorkItemAction,
    to: ApiTypes.WorkItemStatus,
    reason: string | null,
    actor: ApiTypes.Actor | null,
  ): Promise<void> {
    const from = entity.status;
    const now = this.touch(entity);
    entity.status = to;
    if (to === 'in_progress') {
      entity.startedAt ??= now;
    }
    entity.completedAt = to === 'done' ? now : null;
    await this.items.save(entity);
    await this.activity.record(
      entity,
      'status_changed',
      actor,
      { from, to, action, reason },
      now,
    );
    await this.events.emit({
      eventType: 'work-item.status-changed',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      payload: {
        workItem: this.mapper.toSnapshot(entity),
        from,
        to,
        action,
        reason,
      },
    });
  }

  /**
   * Locks the work item for a change: `work:write`, a project and
   * organization that accept writes, and `If-Match` when given.
   */
  private async lockForWrite(
    organizationId: string,
    workItemId: string,
    ifMatch: string | undefined,
  ): Promise<WorkItemEntity> {
    const entity = await this.items.get(organizationId, workItemId, true);
    this.access.assertCanOnItem(entity, 'write');
    if (ifMatch !== undefined && parseVersion(ifMatch) !== entity.version) {
      throw new PreconditionFailedException(
        `Work item ${entity.id} is at version ${entity.version}`,
      );
    }
    await this.access.assertAcceptsWrites(entity);
    return entity;
  }

  private touch(entity: WorkItemEntity): Date {
    const now = new Date();
    entity.version += 1;
    entity.updatedAt = now;
    return now;
  }

  private async presentOne(entity: WorkItemEntity): Promise<Response> {
    const [response] = await this.present([entity]);
    return response;
  }

  /** Responses with the derived fields, looked up for all at once. */
  private async present(entities: WorkItemEntity[]): Promise<Response[]> {
    const ids = entities.map((entity) => entity.id);
    const [responsible, blocked] = await Promise.all([
      this.assignments.responsibleFor(ids),
      this.dependencies.blockedAmong(ids),
    ]);
    return entities.map((entity) =>
      this.mapper.toResponse(
        entity,
        responsible.get(entity.id) ?? null,
        blocked.has(entity.id),
      ),
    );
  }
}

/** `3`, `"3"` or `W/"3"`; anything else matches no version. */
function parseVersion(ifMatch: string): number | null {
  const match = /^(?:W\/)?"?(\d+)"?$/.exec(ifMatch.trim());
  return match ? Number(match[1]) : null;
}
