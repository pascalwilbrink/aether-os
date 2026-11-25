import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  AccessControl,
  findPage,
  mapPage,
  Transactional,
  type ApiTypes,
  type Page,
  type PageRequest,
} from '@hephaestus/core';
import { CouncilsService } from '@hephaestus/councils';
import { TasksService } from '@hephaestus/tasks';

import { CouncilPlanEntity, type PlanReview } from './council-plan.entity.js';
import { creationOrder, withAssignments, type PlanContent } from './plans.js';
import {
  PlanAssignmentInvalidError,
  PlanNotProposedError,
} from './session.errors.js';
import { SessionMapper } from './session.mapper.js';
import { SessionsService } from './sessions.service.js';

/**
 * A council session's plans, reviewed by the person who started it
 * (../../../../docs/councils.md, Planning and delegation). Approving one,
 * with the council's `allowDelegation`, makes the work: a plan task,
 * `waiting` from the start, with each entry as its subtask, in dependency
 * order, all run as the service account the approver chose.
 */
@Injectable()
export class CouncilPlansService {
  constructor(
    @InjectRepository(CouncilPlanEntity)
    private readonly plans: Repository<CouncilPlanEntity>,
    private readonly sessions: SessionsService,
    private readonly tasks: TasksService,
    private readonly councils: CouncilsService,
    private readonly access: AccessControl,
    private readonly mapper: SessionMapper,
  ) {}

  async list(
    organizationId: string,
    projectId: string,
    sessionId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.CouncilPlan>> {
    // The person's own session, or a 404.
    await this.sessions.findById(organizationId, projectId, sessionId);
    const entities = await findPage(
      this.plans,
      { where: { sessionId }, sortBy: 'number', direction: 'ASC' },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toPlanResponse(entity));
  }

  @Transactional()
  async approve(
    organizationId: string,
    projectId: string,
    sessionId: string,
    planId: string,
    body: ApiTypes.ApproveCouncilPlanRequest,
  ): Promise<ApiTypes.CouncilPlan> {
    const { session, plan } = await this.proposed(
      organizationId,
      projectId,
      sessionId,
      planId,
    );
    this.access.assertProjectPermission(projectId, 'task:create');
    const person = this.access.principal().sub;
    const memberIds = session.members.map((member) => member.agentId);
    const assigned = withAssignments(
      contentOf(plan),
      body.assignments ?? [],
      memberIds,
    );
    if ('problem' in assigned) {
      throw new PlanAssignmentInvalidError(assigned.problem);
    }
    const version = await this.councils.version(
      organizationId,
      session.councilVersionId as string,
    );
    plan.entries = assigned.plan.entries;
    if (version.settings.allowDelegation) {
      plan.taskId = await this.makeWork(
        organizationId,
        projectId,
        session,
        plan,
        assigned.plan,
        assigned.changed,
        body.serviceAccountId,
        person,
      );
    }
    return this.decide(plan, { decision: 'approved', comment: null }, person);
  }

  @Transactional()
  async reject(
    organizationId: string,
    projectId: string,
    sessionId: string,
    planId: string,
    body: ApiTypes.RejectCouncilPlanRequest,
  ): Promise<ApiTypes.CouncilPlan> {
    const { plan } = await this.proposed(
      organizationId,
      projectId,
      sessionId,
      planId,
    );
    return this.decide(
      plan,
      { decision: 'rejected', comment: body.comment ?? null },
      this.access.principal().sub,
    );
  }

  @Transactional()
  async requestChanges(
    organizationId: string,
    projectId: string,
    sessionId: string,
    planId: string,
    body: ApiTypes.RequestCouncilPlanChangesRequest,
  ): Promise<ApiTypes.CouncilPlan> {
    const { plan } = await this.proposed(
      organizationId,
      projectId,
      sessionId,
      planId,
    );
    return this.decide(
      plan,
      { decision: 'changes_requested', comment: body.comment },
      this.access.principal().sub,
    );
  }

  /** The plan task and its subtasks; idempotency keys from the plan, so approving twice can't make two trees. */
  private async makeWork(
    organizationId: string,
    projectId: string,
    session: ApiTypes.SessionResponse,
    plan: CouncilPlanEntity,
    content: PlanContent,
    reassigned: ReadonlySet<string>,
    serviceAccountId: string,
    person: string,
  ): Promise<string> {
    const origin = {
      kind: 'council-plan' as const,
      sessionId: session.id,
      planId: plan.id,
    };
    const { task: planTask } = await this.tasks.create(
      organizationId,
      projectId,
      {
        title: content.title,
        description: content.summary,
        agentId: session.agentId,
        serviceAccountId,
      },
      `council-plan:${plan.id}`,
      undefined,
      [],
      {
        origin: {
          ...origin,
          entryKey: null,
          outcomeEntryKey: content.outcomeEntryKey,
          assignedBy: null,
          reason: null,
        },
        waiting: true,
      },
    );
    const taskIds = new Map<string, string>();
    for (const { entry, dependsOn } of creationOrder(content) ?? []) {
      const byPerson = reassigned.has(entry.key);
      const { task } = await this.tasks.create(
        organizationId,
        projectId,
        {
          title: entry.title,
          description: entry.description,
          ...(entry.expectedOutcome
            ? { expectedOutcome: entry.expectedOutcome }
            : {}),
          agentId: entry.agentId,
          serviceAccountId,
          parentTaskId: planTask.id,
          dependsOn: dependsOn.map((key) => taskIds.get(key) as string),
        },
        `council-plan:${plan.id}:${entry.key}`,
        undefined,
        [],
        {
          origin: {
            ...origin,
            entryKey: entry.key,
            outcomeEntryKey: null,
            assignedBy: byPerson ? person : 'facilitator',
            reason: byPerson ? null : (entry.reason ?? null),
          },
        },
      );
      taskIds.set(entry.key, task.id);
    }
    return planTask.id;
  }

  /** The person's session and its plan, locked, which must be waiting for a decision. */
  private async proposed(
    organizationId: string,
    projectId: string,
    sessionId: string,
    planId: string,
  ): Promise<{ session: ApiTypes.SessionResponse; plan: CouncilPlanEntity }> {
    const session = await this.sessions.findById(
      organizationId,
      projectId,
      sessionId,
    );
    this.access.assertProjectPermission(projectId, 'task:approve');
    const plan = await this.plans.findOne({
      where: { id: planId, sessionId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!plan) {
      throw new NotFoundException(`Plan ${planId} not found`);
    }
    if (plan.status !== 'proposed') {
      throw new PlanNotProposedError(plan.id, plan.status);
    }
    return { session, plan };
  }

  private async decide(
    plan: CouncilPlanEntity,
    decision: Pick<PlanReview, 'decision' | 'comment'>,
    person: string,
  ): Promise<ApiTypes.CouncilPlan> {
    plan.status = decision.decision;
    plan.review = {
      ...decision,
      decidedBy: person,
      decidedAt: new Date().toISOString(),
    };
    return this.mapper.toPlanResponse(await this.plans.save(plan));
  }
}

function contentOf(plan: CouncilPlanEntity): PlanContent {
  return {
    title: plan.title,
    summary: plan.summary,
    milestones: plan.milestones,
    entries: plan.entries,
    outcomeEntryKey: plan.outcomeEntryKey,
  };
}
