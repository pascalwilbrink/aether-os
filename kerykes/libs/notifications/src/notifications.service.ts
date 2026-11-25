import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import { Transactional, type DomainEvent } from '@kerykes/core';
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
    const { organizationId, projectId, recipient } = notification;
    if (projectId) {
      return this.memberships.holdsProjectPermission(
        organizationId,
        projectId,
        recipient,
        notification.type === 'review_requested'
          ? 'task:approve'
          : notification.type === 'membership_granted'
            ? 'project:read'
            : notification.type === 'plan_review_requested'
              ? 'session:use'
              : 'task:read',
      );
    }
    return this.memberships.holdsOrganizationPermission(
      organizationId,
      recipient,
      'org:read',
    );
  }

  private async recipients(plan: NotificationPlan): Promise<string[]> {
    const candidates = await this.audience(plan.organizationId, plan.audience);
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

  private audience(
    organizationId: string,
    audience: Audience,
  ): Promise<string[]> {
    switch (audience.kind) {
      case 'user':
        // Only members are users Kerykes knows (a service's `sub` isn't).
        return Promise.resolve([audience.sub]);
      case 'approvers':
        return this.memberships.approvers(organizationId, audience.projectId);
      case 'organization-admins':
        return this.memberships.organizationAdmins(organizationId);
    }
  }
}
