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
  type ErgonEvents,
  type HephaestusEvents,
  type Page,
  type PageRequest,
  type ProxenosEvents,
} from '@kairos/core';

import { AutomationRunEntity, type RunEvent } from './automation-run.entity.js';
import type {
  AutomationEntity,
  StoredWorkTrigger,
} from './automation.entity.js';
import { ErgonClient } from './ergon-client.js';
import { AutomationMapper } from './automation.mapper.js';
import { AutomationsService } from './automations.service.js';
import {
  concurrencyKey,
  fieldsOf,
  match,
  matchesWork,
  renderForTask,
  untrustedInputsOf,
  workFieldsOf,
  workSkipReason,
  workTaskOf,
} from './triggers.js';

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
    private readonly ergon: ErgonClient,
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

  /**
   * An agent became responsible for work in Ergon: each active work
   * automation of the work's project (for that agent, or any) gets a run
   * and sends a `task.create` for the work item as Ergon has it now, read
   * with Kairos's own token; work that's gone, finished or reassigned
   * meanwhile makes the run `skipped`. Ergon not answering throws, so the
   * event is retried.
   */
  @OnDomainEvent('ergon.work-assignment.changed')
  async onWorkAssignmentChanged(
    event: DomainEvent<ErgonEvents.WorkAssignmentChanged>,
  ): Promise<void> {
    const organizationId = event.organizationId;
    if (!organizationId || !event.projectId) return;
    const automations = (
      await this.automations.activeForWork(organizationId)
    ).filter((automation) =>
      matchesWork(
        automation.trigger,
        event.payload,
        event.projectId,
        automation.projectId,
      ),
    );
    if (automations.length === 0) return;
    const { workItemId, assignmentId, assignee, workItemTitle } = event.payload;
    const workItem = await this.ergon.getWorkItem(organizationId, workItemId);
    const skip = workSkipReason(workItem, assignee.id);
    for (const automation of automations) {
      const run = await this.insertRun(automation, event.eventId, {
        eventId: event.eventId,
        type: 'ergon.work-assigned',
        workItemId,
        assignmentId,
        agentId: assignee.id,
        title: workItem?.title ?? workItemTitle,
      });
      if (!run) continue;
      if (skip || !workItem) {
        await this.runs.update(
          { id: run.id },
          { status: 'skipped', rejection: skip, updatedAt: new Date() },
        );
        continue;
      }
      const trigger = automation.trigger as StoredWorkTrigger;
      const { action } = automation;
      const fields = workFieldsOf(workItem, assignee.id);
      await this.sendTaskCreate(automation, run.id, {
        automationId: automation.id,
        task: {
          ...workTaskOf(workItem, assignee.id),
          serviceAccountId: action.serviceAccountId,
          ...(trigger.repositoryLinkId
            ? { repository: { linkId: trigger.repositoryLinkId } }
            : {}),
          ...(action.reviewArtifactKinds.length > 0
            ? { review: { artifactKinds: action.reviewArtifactKinds } }
            : {}),
          ...(action.concurrency
            ? {
                concurrency: {
                  key: concurrencyKey(
                    automation.id,
                    action.concurrency.key,
                    fields,
                  ),
                  policy: action.concurrency.policy,
                },
              }
            : {}),
          ...(action.context?.length ? { context: action.context } : {}),
        },
      });
      await this.announce(
        automation,
        run.id,
        'ergon.work-assigned',
        event.eventId,
        null,
      );
      this.logger.log(
        `Automation ${automation.id} started agent ${assignee.id} on work item ${workItemId} (run ${run.id})`,
      );
    }
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

  /**
   * Hephaestus refused a run's command; it's never retried. Refused for its
   * concurrency key (policy `skip`), the run is `skipped`.
   */
  @OnDomainEvent('hephaestus.task.create-rejected')
  async onTaskCreateRejected(
    event: DomainEvent<HephaestusEvents.TaskCreateRejected>,
  ): Promise<void> {
    const { idempotencyKey, code, message } = event.payload;
    await this.answer(event.organizationId, idempotencyKey, {
      status: code === 'TASK_CONCURRENCY_SKIPPED' ? 'skipped' : 'rejected',
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
    const run = await this.insertRun(automation, event.eventId, {
      eventId: event.eventId,
      type,
      webhookDeliveryId: payload.webhookDeliveryId,
      repository: payload.repository,
      issueNumber: payload.number,
      url: payload.url,
      author: payload.author.login,
    });
    if (!run) return;
    await this.sendTaskCreate(
      automation,
      run.id,
      taskCreate(automation, fieldsOf(payload), linkId),
    );
    await this.announce(
      automation,
      run.id,
      type,
      event.eventId,
      payload.webhookDeliveryId,
    );
    this.logger.log(
      `Automation ${automation.id} fired for ${payload.repository}#${payload.number} (run ${run.id})`,
    );
  }

  /** A new run, or null when this automation already fired for this event. */
  private async insertRun(
    automation: AutomationEntity,
    sourceEventId: string,
    event: RunEvent,
  ): Promise<AutomationRunEntity | null> {
    const run = this.mapper.toRunEntity(
      automation,
      sourceEventId,
      event,
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
    return inserted.length > 0 ? run : null;
  }

  /** The command, its idempotency key the run's ID, through the outbox. */
  private async sendTaskCreate(
    automation: AutomationEntity,
    runId: string,
    payload: TaskCreate,
  ): Promise<void> {
    await this.domainEvents.send<TaskCreate>('hephaestus', {
      eventId: runId,
      eventType: 'task.create',
      aggregateId: runId,
      aggregateVersion: 1,
      organizationId: automation.organizationId,
      projectId: automation.projectId,
      payload,
    });
  }

  private async announce(
    automation: AutomationEntity,
    runId: string,
    triggerType: string,
    sourceEventId: string,
    webhookDeliveryId: string | null,
  ): Promise<void> {
    await this.events.emit({
      eventType: 'automation.triggered',
      aggregateId: runId,
      aggregateVersion: 1,
      organizationId: automation.organizationId,
      projectId: automation.projectId,
      payload: {
        automationId: automation.id,
        runId,
        triggerType,
        sourceEventId,
        webhookDeliveryId,
      },
    });
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
    ...(action.concurrency
      ? {
          concurrency: {
            key: concurrencyKey(automation.id, action.concurrency.key, fields),
            policy: action.concurrency.policy,
          },
        }
      : {}),
    // The issue's title is the opener's: data for the agent, never instructions.
    untrustedInputs: untrustedInputsOf(fields),
    ...(action.context?.length ? { context: action.context } : {}),
  };
  if (action.task) {
    return {
      automationId: automation.id,
      task: {
        agentId: action.task.agentId,
        title: renderForTask(action.task.title, fields),
        description: renderForTask(action.task.instructions, fields),
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
          renderForTask(value, fields),
        ]),
      ),
      ...common,
    },
  };
}
