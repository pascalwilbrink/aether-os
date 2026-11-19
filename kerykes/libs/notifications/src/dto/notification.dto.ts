import {
  createZodDto,
  zListNotificationsPath,
  zListNotificationsQuery,
  zNotificationPage,
  zNotificationResponse,
  zReadAllResponse,
  zReadNotificationPath,
  zUnreadCount,
} from '@kerykes/core';

/** `:organizationId`. */
export class NotificationsParams extends createZodDto(zListNotificationsPath) {}
/** `:organizationId` and `:notificationId`. */
export class NotificationParams extends createZodDto(zReadNotificationPath) {}
export class ListNotificationsQuery extends createZodDto(
  zListNotificationsQuery,
) {}
export class NotificationResponse extends createZodDto(zNotificationResponse) {}
export class NotificationPage extends createZodDto(zNotificationPage) {}
export class UnreadCount extends createZodDto(zUnreadCount) {}
export class ReadAllResponse extends createZodDto(zReadAllResponse) {}
