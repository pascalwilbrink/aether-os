import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import {
  Transactional,
  type DomainEvent,
  type ProjectPermission,
} from '@kerykes/core';
import { Directory } from '@kerykes/directory';
import { MembershipsService } from '@kerykes/memberships';

import {
  EmailDeliveryEntity,
  NotificationEntity,
} from './notification.entities.js';
import {
  NOTIFICATIONS_OPTIONS,
  type NotificationsOptions,
} from './notifications.options.js';
import { planFor, type Audience, type NotificationPlan } from './rules.js';

/** What a recipient must still hold in the project before an email goes. */
const PROJECT_PERMISSIONS: Partial<
  Record<NotificationEntity['type'], ProjectPermission>
> = {
  review_requested: 'task:approve',
  membership_granted: 'project:read',
  plan_review_requested: 'session:use',
  work_assigned: 'work:read',
  work_review_requested: 'work:write',
};

/**
 * Turns events into notifications (docs/notifications.md): the plan from
 * `rules.ts`, its audience resolved from the membership copy, only users
 * who hold what it requires now, one inbox entry each (a repeat of its
 * group adds nothing), and an email to send where the plan has one.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
    @InjectRepository(EmailDeliveryEntity)
    private readonly deliveries: Repository<EmailDeliveryEntity>,
    private readonly memberships: MembershipsService,
    private readonly directory: Directory,
    @Inject(NOTIFICATIONS_OPTIONS)
    private readonly options: NotificationsOptions,
  ) {}

  /** The notifications for one event (in the inbox's transaction); their count. */
  @Transactional()
  async notify(source: string, event: DomainEvent<unknown>): Promise<number> {
    const plan = planFor(event, source);
    if (!plan) {
      return 0;
    }
    await this.memberships.ensureSynced(plan.organizationId);
    const recipients = await this.recipients(plan);
    if (recipients.length === 0) {
      return 0;
    }
    const projectName = plan.projectId
      ? await this.directory.projectName(plan.organizationId, plan.projectId)
      : null;
    const { title, body } = plan.render(projectName);
    const now = new Date();
    let created = 0;
    for (const recipient of recipients) {
      const id = uuidv7();
      const inserted = await this.notifications
        .createQueryBuilder()
        .insert()
        .values({
          id,
          organizationId: plan.organizationId,
          projectId: plan.projectId,
          scopeId: plan.projectId ?? plan.organizationId,
          recipient,
          type: plan.type,
          title,
          body,
          link: plan.link,
          taskId: plan.taskId,
          groupKey: plan.groupKey,
          eventId: event.eventId,
          read: false,
          readAt: null,
          createdAt: now,
        })
        .orIgnore()
        .returning(['id'])
        .execute();
      if (inserted.raw.length === 0) {
        continue;
      }
      created++;
      if (plan.email) {
        await this.deliveries.insert({
          notificationId: id,
          status: this.options.emailEnabled ? 'pending' : 'skipped',
          attempts: 0,
          nextAttemptAt: now,
          reason: this.options.emailEnabled ? null : 'email is turned off',
          sentAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    if (created > 0) {
      this.logger.log(
        `${plan.type}: ${created} notification(s) for event ${event.eventId}`,
      );
    }
    return created;
  }

  /** Whether the recipient may still be told about it (checked again before an email). */
  async mayReceive(
    notification: Pick<
      NotificationEntity,
      'organizationId' | 'projectId' | 'recipient' | 'type'
    >,
  ): Promise<boolean> {
    const { organizationId, projectId, recipient, type } = notification;
    if (projectId) {
      return this.memberships.holdsProjectPermission(
        organizationId,
        projectId,
        recipient,
        PROJECT_PERMISSIONS[type] ?? 'task:read',
      );
    }
    return this.memberships.holdsOrganizationPermission(
      organizationId,
      recipient,
      type === 'work_assigned' ? 'org:work:read' : 'org:read',
    );
  }

  private async recipients(plan: NotificationPlan): Promise<string[]> {
    const except = plan.except ?? null;
    const candidates = (
      await this.audience(plan.organizationId, plan.audience, except)
    ).filter((sub) => sub !== except);
    const { requires } = plan;
    if (!requires) {
      return candidates;
    }
    const allowed: string[] = [];
    for (const sub of candidates) {
      const holds =
        'project' in requires
          ? await this.memberships.holdsProjectPermission(
              plan.organizationId,
              plan.projectId!,
              sub,
              requires.project,
            )
          : await this.memberships.holdsOrganizationPermission(
              plan.organizationId,
              sub,
              requires.organization,
            );
      if (holds) {
        allowed.push(sub);
      }
    }
    return allowed;
  }

  private async audience(
    organizationId: string,
    audience: Audience,
    except: string | null,
  ): Promise<string[]> {
    switch (audience.kind) {
      case 'user':
        // Only members are users Kerykes knows (a service's `sub` isn't).
        return [audience.sub];
      case 'approvers':
        return this.memberships.approvers(organizationId, audience.projectId);
      case 'organization-admins':
        return this.memberships.organizationAdmins(organizationId);
      case 'person': {
        const user = await this.directory.personUser(
          organizationId,
          audience.personId,
        );
        return user ? [user] : [];
      }
      case 'work-reviewers':
        return this.workReviewers(organizationId, audience, except);
    }
  }

  /**
   * A work item's reviewers (persons with the `reviewer` role), else the
   * person responsible for it, else the project's approvers: the first of
   * these with a signed-up user other than `except` who may change the work
   * (`work:write`), so a reviewer who can't approve passes it on.
   */
  private async workReviewers(
    organizationId: string,
    audience: Extract<Audience, { kind: 'work-reviewers' }>,
    except: string | null,
  ): Promise<string[]> {
    const assignees =
      (await this.directory.workAssignments(
        organizationId,
        audience.workItemId,
      )) ?? [];
    for (const role of ['reviewer', 'responsible'] as const) {
      const users: string[] = [];
      for (const assignee of assignees) {
        if (assignee.kind !== 'person' || assignee.role !== role) continue;
        const user = await this.directory.personUser(
          organizationId,
          assignee.id,
        );
        if (
          user &&
          user !== except &&
          !users.includes(user) &&
          (await this.memberships.holdsProjectPermission(
            organizationId,
            audience.projectId,
            user,
            'work:write',
          ))
        ) {
          users.push(user);
        }
      }
      if (users.length > 0) return users;
    }
    return this.memberships.approvers(organizationId, audience.projectId);
  }
}
