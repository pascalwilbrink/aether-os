import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  DomainEvents,
  findPage,
  KairosEvents,
  mapPage,
  OnDomainEvent,
  type ApiTypes,
  type DomainEvent,
  type HephaestusEvents,
  type Page,
  type PageRequest,
  type ProxenosEvents,
} from '@kairos/core';

import { AutomationRunEntity } from './automation-run.entity.js';
import type { AutomationEntity } from './automation.entity.js';
import { AutomationMapper } from './automation.mapper.js';
import { AutomationsService } from './automations.service.js';
import { fieldsOf, match, render } from './triggers.js';

type IssueEvent = ProxenosEvents.GithubIssueOpened;
type TaskCreate = HephaestusEvents.TaskCreate;

/**
 * Firing automations (docs/automations.md). For each of Proxenos's issue
 * events, every active automation of the event's organization whose trigger
 * matches gets a run (one per automation and event: a redelivered event
 * fires nothing again) and sends Hephaestus a `task.create` command, its
 * idempotency key the run's ID, in the same transaction (outbox). The run
 * then follows Hephaestus's answer: `task.created` or `task.create-rejected`.
 */
@Injectable()
export class AutomationRunsService {
  private readonly logger = new Logger(AutomationRunsService.name);

  constructor(
    @InjectRepository(AutomationRunEntity)
    private readonly runs: Repository<AutomationRunEntity>,
    private readonly automations: AutomationsService,
    private readonly mapper: AutomationMapper,
    private readonly domainEvents: DomainEvents,
    private readonly events: KairosEvents,
  ) {}

  async list(
    organizationId: string,
    projectId: string,
    automationId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.AutomationRunResponse>> {
    await this.automations.assertExists(
      organizationId,
      projectId,
      automationId,
    );
    const entities = await findPage(
      this.runs,
      { where: { automationId }, sortBy: 'createdAt', direction: 'DESC' },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toRunResponse(entity));
  }

  @OnDomainEvent('proxenos.github.issue.opened')
  onIssueOpened(event: DomainEvent<IssueEvent>): Promise<void> {
    return this.fire('github.issue.opened', event);
  }

  @OnDomainEvent('proxenos.github.issue.labeled')
  onIssueLabeled(event: DomainEvent<IssueEvent>): Promise<void> {
    return this.fire('github.issue.labeled', event);
  }

  @OnDomainEvent('proxenos.github.issue-comment.created')
  onIssueCommentCreated(event: DomainEvent<IssueEvent>): Promise<void> {
    return this.fire('github.issue-comment.created', event);
  }

  /** Hephaestus created the task a run asked for (or had already). */
  @OnDomainEvent('hephaestus.task.created')
  async onTaskCreated(
    event: DomainEvent<HephaestusEvents.TaskCreated>,
  ): Promise<void> {
    await this.answer(event.organizationId, event.payload.idempotencyKey, {
      status: 'created',
      taskId: event.payload.taskId,
      rejection: null,
    });
  }

  /** Hephaestus refused a run's command; it's never retried. */
  @OnDomainEvent('hephaestus.task.create-rejected')
  async onTaskCreateRejected(
    event: DomainEvent<HephaestusEvents.TaskCreateRejected>,
  ): Promise<void> {
    const { idempotencyKey, code, message } = event.payload;
    await this.answer(event.organizationId, idempotencyKey, {
      status: 'rejected',
      taskId: null,
      rejection: { code, message },
    });
  }

  private async fire(
    type: ApiTypes.GitHubIssueEventType,
    event: DomainEvent<IssueEvent>,
  ): Promise<void> {
    const organizationId = event.organizationId;
    if (!organizationId) return;
    for (const automation of await this.automations.activeFor(
      organizationId,
      type,
    )) {
      const matched = match(
        automation.trigger,
        type,
        event.payload,
        automation.projectId,
      );
      if (matched) {
        await this.start(automation, type, event, matched.linkId);
      }
    }
  }

  private async start(
    automation: AutomationEntity,
    type: ApiTypes.GitHubIssueEventType,
    event: DomainEvent<IssueEvent>,
    linkId: string,
  ): Promise<void> {
    const { payload } = event;
    const run = this.mapper.toRunEntity(
      automation,
      event.eventId,
      {
        eventId: event.eventId,
        type,
        webhookDeliveryId: payload.webhookDeliveryId,
        repository: payload.repository,
        issueNumber: payload.number,
        url: payload.url,
        author: payload.author.login,
      },
      new Date(),
    );
    const inserted: unknown[] = (
      await this.runs
        .createQueryBuilder()
        .insert()
        .values(run)
        .orIgnore()
        .returning('id')
        .execute()
    ).raw;
    if (inserted.length === 0) {
      // This automation already fired for this event.
      return;
    }

    await this.domainEvents.send<TaskCreate>('hephaestus', {
      // The run is the command's idempotency key.
      eventId: run.id,
      eventType: 'task.create',
      aggregateId: run.id,
      aggregateVersion: 1,
      organizationId: automation.organizationId,
      projectId: automation.projectId,
      payload: taskCreate(automation, fieldsOf(payload), linkId),
    });
    await this.events.emit({
      eventType: 'automation.triggered',
      aggregateId: run.id,
      aggregateVersion: 1,
      organizationId: automation.organizationId,
      projectId: automation.projectId,
      payload: {
        automationId: automation.id,
        runId: run.id,
        triggerType: type,
        sourceEventId: event.eventId,
        webhookDeliveryId: payload.webhookDeliveryId,
      },
    });
    this.logger.log(
      `Automation ${automation.id} fired for ${payload.repository}#${payload.number} (run ${run.id})`,
    );
  }

  /** Records Hephaestus's answer on the run it's for, if it's one of Kairos's. */
  private async answer(
    organizationId: string | null,
    runId: string,
    outcome: Pick<AutomationRunEntity, 'status' | 'taskId' | 'rejection'>,
  ): Promise<void> {
    if (!organizationId) return;
    // Other tasks' keys aren't UUIDs at all, or not Kairos's runs.
    if (!/^[0-9a-f-]{36}$/i.test(runId)) return;
    await this.runs.update(
      { id: runId, organizationId },
      { ...outcome, updatedAt: new Date() },
    );
  }
}

/** The `task.create` command for an automation and an event's fields. */
function taskCreate(
  automation: AutomationEntity,
  fields: Record<string, string>,
  linkId: string,
): TaskCreate {
  const { action } = automation;
  const common = {
    serviceAccountId: action.serviceAccountId,
    ...(action.workInRepository ? { repository: { linkId } } : {}),
    ...(action.reviewArtifactKinds.length > 0
      ? { review: { artifactKinds: action.reviewArtifactKinds } }
      : {}),
  };
  if (action.task) {
    return {
      automationId: automation.id,
      task: {
        agentId: action.task.agentId,
        title: render(action.task.title, fields),
        instructions: render(action.task.instructions, fields),
        ...common,
      },
    };
  }
  const template = action.template!;
  return {
    automationId: automation.id,
    template: {
      templateId: template.templateId,
      ...(template.version ? { version: template.version } : {}),
      inputs: Object.fromEntries(
        Object.entries(template.inputs ?? {}).map(([name, value]) => [
          name,
          render(value, fields),
        ]),
      ),
      ...common,
    },
  };
}
