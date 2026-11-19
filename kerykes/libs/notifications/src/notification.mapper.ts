import { Injectable } from '@nestjs/common';

import type { ApiTypes } from '@kerykes/core';

import type { NotificationEntity } from './notification.entities.js';

@Injectable()
export class NotificationMapper {
  toResponse(entity: NotificationEntity): ApiTypes.NotificationResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      type: entity.type,
      title: entity.title,
      body: entity.body,
      link: entity.link,
      taskId: entity.taskId,
      readAt: entity.readAt?.toISOString() ?? null,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
