import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { RequirePermission, ZodSerializerDto } from '@kerykes/core';

import {
  ListNotificationsQuery,
  NotificationPage,
  NotificationParams,
  NotificationResponse,
  NotificationsParams,
  ReadAllResponse,
  UnreadCount,
} from './dto/notification.dto.js';
import { InboxService } from './inbox.service.js';

/** The caller's own inbox in the token's organization. */
@Controller('organizations/:organizationId/notifications')
@RequirePermission('org:read')
export class NotificationsController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  @ZodSerializerDto(NotificationPage)
  list(
    @Param() { organizationId }: NotificationsParams,
    @Query() query: ListNotificationsQuery,
  ) {
    return this.inbox.list(organizationId, query);
  }

  @Get('unread-count')
  @ZodSerializerDto(UnreadCount)
  unreadCount(@Param() { organizationId }: NotificationsParams) {
    return this.inbox.unreadCount(organizationId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(ReadAllResponse)
  readAll(@Param() { organizationId }: NotificationsParams) {
    return this.inbox.markAllRead(organizationId);
  }

  @Post(':notificationId/read')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(NotificationResponse)
  read(@Param() { organizationId, notificationId }: NotificationParams) {
    return this.inbox.markRead(organizationId, notificationId, true);
  }

  @Post(':notificationId/unread')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(NotificationResponse)
  unread(@Param() { organizationId, notificationId }: NotificationParams) {
    return this.inbox.markRead(organizationId, notificationId, false);
  }
}
