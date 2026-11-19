import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';

import {
  AccessControl,
  findPage,
  mapPage,
  Transactional,
  type ApiTypes,
  type Page,
  type PageRequest,
} from '@kerykes/core';

import { NotificationEntity } from './notification.entities.js';
import { NotificationMapper } from './notification.mapper.js';

/**
 * A user's inbox in one organization (docs/notifications.md, In-app): only
 * their own notifications, and only about the organization and projects
 * they can still read (their token says which).
 */
@Injectable()
export class InboxService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
    private readonly mapper: NotificationMapper,
    private readonly access: AccessControl,
  ) {}

  async list(
    organizationId: string,
    query: PageRequest & { unread?: boolean },
  ): Promise<Page<ApiTypes.NotificationResponse>> {
    const page = await findPage(
      this.notifications,
      {
        where: {
          ...this.mine(organizationId),
          ...(query.unread === undefined ? {} : { read: !query.unread }),
        },
        sortBy: 'createdAt',
        direction: 'DESC',
      },
      query,
    );
    return mapPage(page, (entity) => this.mapper.toResponse(entity));
  }

  async unreadCount(organizationId: string): Promise<ApiTypes.UnreadCount> {
    const { scopeId, ...where } = this.mine(organizationId);
    const unread = await this.notifications.count({
      where: {
        ...where,
        ...(scopeId ? { scopeId: In(scopeId) } : {}),
        read: false,
      },
    });
    return { unread };
  }

  @Transactional()
  async markRead(
    organizationId: string,
    notificationId: string,
    read: boolean,
  ): Promise<ApiTypes.NotificationResponse> {
    const { scopeId, ...where } = this.mine(organizationId);
    const entity = await this.notifications.findOneBy({
      ...where,
      ...(scopeId ? { scopeId: In(scopeId) } : {}),
      id: notificationId,
    });
    if (!entity) {
      throw new NotFoundException(`Notification ${notificationId} not found`);
    }
    if (entity.read !== read) {
      entity.read = read;
      entity.readAt = read ? new Date() : null;
      await this.notifications.save(entity);
    }
    return this.mapper.toResponse(entity);
  }

  @Transactional()
  async markAllRead(organizationId: string): Promise<ApiTypes.ReadAllResponse> {
    const { scopeId, ...where } = this.mine(organizationId);
    const result = await this.notifications.update(
      { ...where, ...(scopeId ? { scopeId: In(scopeId) } : {}), read: false },
      { read: true, readAt: new Date() },
    );
    return { read: result.affected ?? 0 };
  }

  /**
   * The caller's notifications: theirs, in this organization, about it or a
   * project they can read. Users only.
   */
  private mine(organizationId: string): {
    organizationId: string;
    recipient: string;
    scopeId?: string[];
  } {
    const principal = this.access.principal();
    if (principal.subType !== 'user') {
      throw new ForbiddenException('Only users have an inbox');
    }
    const readable = this.access.readableProjects();
    return {
      organizationId,
      recipient: principal.sub,
      ...(readable === 'all' ? {} : { scopeId: [organizationId, ...readable] }),
    };
  }
}
